// JSON pretty-printer (comment-aware) and scalar value parser. Pure functions.

export function stripJsonCommentsForFormat(str) {
  if (typeof str !== 'string') return str;
  let result = '';
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;
  let lineStart = true;

  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const next = str[i + 1];

    if (inLineComment) {
      if (c === '\n') {
        inLineComment = false;
        result += c;
        lineStart = true;
      }
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      result += c;
      lineStart = false;
      if (c === '\\' && i + 1 < str.length) {
        result += str[++i];
        continue;
      }
      if (c === stringChar) inString = false;
      continue;
    }

    if (c === '"' || c === "'") {
      inString = true;
      stringChar = c;
      result += c;
      lineStart = false;
      continue;
    }
    if (c === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (lineStart && c === '/') {
      inLineComment = true;
      continue;
    }
    result += c;
    if (c === '\n') lineStart = true;
    else if (!/\s/.test(c)) lineStart = false;
  }
  return result;
}

export function getJsonErrorLocation(error, text) {
  const match = /position\s+(\d+)/i.exec(error && error.message ? error.message : '');
  if (!match) return null;
  const position = Number(match[1]);
  if (!Number.isFinite(position)) return null;
  const before = text.slice(0, position);
  const lines = before.split(/\r\n|\r|\n/);
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

export function buildJsonSyntaxMessage(error, text) {
  const loc = getJsonErrorLocation(error, text);
  if (!loc) return `${error.message} (строка 1, колонка 1)`;
  return `${error.message} (строка ${loc.line}, колонка ${loc.column})`;
}

function appendMissingClosers(text) {
  let result = text.trim();
  const stack = [];
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;
  let lineStart = true;

  for (let i = 0; i < result.length; i++) {
    const c = result[i];
    const next = result[i + 1];

    if (inLineComment) {
      if (c === '\n') {
        inLineComment = false;
        lineStart = true;
      }
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (c === '\\' && i + 1 < result.length) {
        i++;
        continue;
      }
      if (c === stringChar) inString = false;
      lineStart = false;
      continue;
    }

    if (c === '"' || c === "'") {
      inString = true;
      stringChar = c;
      lineStart = false;
      continue;
    }
    if (c === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (lineStart && c === '/') {
      inLineComment = true;
      continue;
    }

    if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') {
      const expected = stack.pop();
      if (expected !== c) throw new SyntaxError(`Неожиданная закрывающая скобка "${c}"`);
    }

    if (c === '\n') lineStart = true;
    else if (!/\s/.test(c)) lineStart = false;
  }

  if (inString) throw new SyntaxError('Не закрыта строка в JSON');
  const closers = stack.reverse().join('');
  if (closers && inLineComment && !result.endsWith('\n')) result += '\n';
  result += closers;
  return result.replace(/,\s*([}\]])/g, '$1');
}

export function repairJsonText(text) {
  const repaired = appendMissingClosers(stripJsonCommentsForFormat(text || ''));
  try {
    JSON.parse(repaired);
  } catch (e) {
    throw new SyntaxError(buildJsonSyntaxMessage(e, repaired));
  }
  return repaired;
}

export function formatJSON(text) {
  if (!text || !text.trim()) return '';
  text = appendMissingClosers(text);

  try {
    JSON.parse(stripJsonCommentsForFormat(text));
  } catch (e) {
    throw new SyntaxError(buildJsonSyntaxMessage(e, stripJsonCommentsForFormat(text)));
  }

  const tokens = [];
  let i = 0;
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;
  let currentToken = '';
  let lineStart = true;

  const pushToken = (type, value) => {
    if (value.length > 0) tokens.push({ type, value });
  };

  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      currentToken += c;
      if (c === '\n') {
        pushToken('line-comment', currentToken);
        currentToken = '';
        inLineComment = false;
        lineStart = true;
      }
      i++;
      continue;
    }

    if (inBlockComment) {
      currentToken += c;
      if (c === '*' && next === '/') {
        currentToken += '/';
        pushToken('block-comment', currentToken);
        currentToken = '';
        inBlockComment = false;
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    if (inString) {
      currentToken += c;
      lineStart = false;
      if (c === '\\' && i + 1 < text.length) {
        currentToken += text[i + 1];
        i += 2;
        continue;
      }
      if (c === stringChar) {
        pushToken('string', currentToken);
        currentToken = '';
        inString = false;
      }
      i++;
      continue;
    }

    if (c === '"' || c === "'") {
      if (currentToken.trim()) pushToken('value', currentToken.trim());
      currentToken = c;
      inString = true;
      stringChar = c;
      lineStart = false;
      i++;
      continue;
    }

    if (c === '/' && next === '/') {
      if (currentToken.trim()) pushToken('value', currentToken.trim());
      currentToken = '//';
      inLineComment = true;
      i += 2;
      continue;
    }

    if (c === '/' && next === '*') {
      if (currentToken.trim()) pushToken('value', currentToken.trim());
      currentToken = '/*';
      inBlockComment = true;
      i += 2;
      continue;
    }

    if (lineStart && c === '/') {
      if (currentToken.trim()) pushToken('value', currentToken.trim());
      currentToken = '/';
      inLineComment = true;
      i++;
      continue;
    }

    if (c === '{' || c === '[' || c === '}' || c === ']' || c === ',' || c === ':') {
      if (currentToken.trim()) pushToken('value', currentToken.trim());
      pushToken('symbol', c);
      currentToken = '';
      lineStart = false;
      i++;
      continue;
    }

    if (/\s/.test(c)) {
      if (currentToken.trim()) {
        pushToken('value', currentToken.trim());
        currentToken = '';
      }
      if (c === '\n') lineStart = true;
      i++;
      continue;
    }

    currentToken += c;
    lineStart = false;
    i++;
  }

  if (currentToken.trim()) pushToken('value', currentToken.trim());

  let result = '';
  let indent = 0;
  const indentStr = '  ';

  const addNewline = () => {
    result += '\n' + indentStr.repeat(indent);
  };

  for (let j = 0; j < tokens.length; j++) {
    const token = tokens[j];
    const prev = tokens[j - 1];
    const next = tokens[j + 1];

    if (token.type === 'symbol') {
      if (token.value === '{' || token.value === '[') {
        result += token.value;
        indent++;
        if (next && !(next.type === 'symbol' && (next.value === '}' || next.value === ']'))) {
          addNewline();
        }
      } else if (token.value === '}' || token.value === ']') {
        indent--;
        if (prev && !(prev.type === 'symbol' && (prev.value === '{' || prev.value === '['))) {
          addNewline();
        }
        result += token.value;
      } else if (token.value === ',') {
        result += ',';
        if (next && !(next.type === 'symbol' && (next.value === '}' || next.value === ']'))) {
          addNewline();
        }
      } else if (token.value === ':') {
        result += ': ';
      }
    } else if (token.type === 'line-comment') {
      if (result.length > 0 && !result.endsWith('\n') && !result.endsWith(indentStr)) {
        result += '\n' + indentStr.repeat(indent);
      }
      result += token.value.replace(/\n$/, '');
      if (next) addNewline();
    } else if (token.type === 'block-comment') {
      if (result.length > 0 && !result.endsWith('\n') && !result.endsWith(' ')) {
        result += ' ';
      }
      result += token.value;
      if (next && next.type !== 'symbol') result += ' ';
    } else if (token.type === 'string' || token.type === 'value') {
      if (prev && prev.type === 'symbol' && prev.value === ':') {
        // Пробел уже добавлен после :
      } else if (prev && prev.type === 'symbol' && (prev.value === '{' || prev.value === '[' || prev.value === ',')) {
        // Перенос строки уже добавлен
      } else if (prev && result.length > 0 && !result.endsWith(' ') && !result.endsWith('\n')) {
        result += ' ';
      }
      result += token.value;
    }
  }

  return result.trim();
}

export function parseJsonValue(value) {
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d*\.\d+$/.test(value)) return parseFloat(value);
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  if (value.toLowerCase() === 'null') return null;

  if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
    try {
      return JSON.parse(value);
    } catch {
      /* not valid JSON, fall through to returning the raw string */
    }
  }

  return value;
}
