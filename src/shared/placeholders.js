// Placeholder substitution shared between the main process and tests.
const { cleanString } = require('./strings');

const PLACEHOLDER_PATH_REGEX = /^[A-Za-z0-9_$-]+(?:\.[A-Za-z0-9_$-]+)*$/;
const DOUBLE_BRACE_PATTERN = /\{\{([^{}]+)\}\}/g;
const MIXED_BRACE_PATTERN = /\{\{([^{}]+)\}\}|{([^{}]+)}/g;

function replacePlaceholders(template, item, environment = {}, options = {}) {
  if (!template) return template;
  const cleaned = cleanString(template);
  const { toJson = false, allowSingle = true } = options;
  const env = environment && typeof environment === 'object' ? environment : {};
  const resolveValue = (match, pathStr) => {
    if (!PLACEHOLDER_PATH_REGEX.test(pathStr)) return match;

    if (item === null || typeof item !== 'object') {
      if (pathStr === 'id') return String(item ?? '');
      if (pathStr in env) {
        const v = env[pathStr];
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return toJson ? JSON.stringify(v) : match;
        return String(v);
      }
      return match;
    }

    const keys = pathStr.split('.');
    let value = item;
    let foundInItem = true;

    for (const key of keys) {
      if (value === null || value === undefined) {
        foundInItem = false;
        break;
      }
      if (typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        foundInItem = false;
        break;
      }
    }

    if (foundInItem && value !== undefined) {
      if (value === null) return '';
      if (typeof value === 'object') return toJson ? JSON.stringify(value) : match;
      return String(value);
    }

    if (pathStr in env) {
      const v = env[pathStr];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return toJson ? JSON.stringify(v) : match;
      return String(v);
    }

    return match;
  };

  // allowSingle=false is used for text where {…} is syntax rather than a
  // placeholder — GraphQL queries such as `query { id name }` would otherwise
  // be rewritten from runner data.
  const pattern = allowSingle ? MIXED_BRACE_PATTERN : DOUBLE_BRACE_PATTERN;
  return cleaned.replace(pattern, (match, doublePath, singlePath) =>
    resolveValue(match, (doublePath || singlePath || '').trim()),
  );
}

module.exports = { replacePlaceholders };
