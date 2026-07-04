// Pure string utilities shared between the main process and tests.

function cleanString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/[\u200C\u200D\u2060\u2061\u2062\u2063]/g, '')
    .replace(/[\uFFF0-\uFFFF]/g, '')
    .replace(/[\u00AD]/g, '')
    .replace(/[\u180E]/g, '');
}

function stripJsonComments(str) {
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

function getJsonErrorLocation(error, text) {
  const match = /position\s+(\d+)/i.exec(error && error.message ? error.message : '');
  if (!match) return null;
  const position = Number(match[1]);
  if (!Number.isFinite(position)) return null;
  const before = text.slice(0, position);
  const lines = before.split(/\r\n|\r|\n/);
  return { line: lines.length, column: lines[lines.length - 1].length + 1, position };
}

function buildJsonSyntaxMessage(error, text) {
  const loc = getJsonErrorLocation(error, text);
  if (!loc) return `${error.message} (line 1, column 1)`;
  return `${error.message} (line ${loc.line}, column ${loc.column})`;
}

function closeJsonBrackets(text) {
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
      if (expected !== c) {
        const err = new SyntaxError(`Unexpected closing "${c}", expected "${expected || 'nothing'}"`);
        err.position = i;
        throw err;
      }
    }

    if (c === '\n') lineStart = true;
    else if (!/\s/.test(c)) lineStart = false;
  }

  if (inString) throw new SyntaxError('Unclosed string in JSON body');
  const closers = stack.reverse().join('');
  if (closers && inLineComment && !result.endsWith('\n')) result += '\n';
  result += closers;
  return result.replace(/,\s*([}\]])/g, '$1');
}

function repairJsonText(text) {
  const withoutComments = stripJsonComments(text || '');
  const repaired = closeJsonBrackets(withoutComments);
  try {
    JSON.parse(repaired);
  } catch (e) {
    e.message = buildJsonSyntaxMessage(e, repaired);
    throw e;
  }
  return repaired;
}

module.exports = { cleanString, stripJsonComments, repairJsonText, buildJsonSyntaxMessage, getJsonErrorLocation };
