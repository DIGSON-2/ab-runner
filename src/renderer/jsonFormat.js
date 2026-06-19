// JSON pretty-printer (comment-aware) and scalar value parser. Pure functions.

export function formatJSON(text) {
  if (!text || !text.trim()) return '';
  const tokens = [];
  let i = 0;
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;
  let currentToken = '';

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

    if (c === '{' || c === '[' || c === '}' || c === ']' || c === ',' || c === ':') {
      if (currentToken.trim()) pushToken('value', currentToken.trim());
      pushToken('symbol', c);
      currentToken = '';
      i++;
      continue;
    }

    if (/\s/.test(c)) {
      if (currentToken.trim()) {
        pushToken('value', currentToken.trim());
        currentToken = '';
      }
      i++;
      continue;
    }

    currentToken += c;
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
