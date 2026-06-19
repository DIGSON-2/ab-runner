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

  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const next = str[i + 1];

    if (inLineComment) {
      if (c === '\n') {
        inLineComment = false;
        result += c;
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
    result += c;
  }
  return result;
}

module.exports = { cleanString, stripJsonComments };
