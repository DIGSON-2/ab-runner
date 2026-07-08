// Placeholder substitution shared between the main process and tests.
const { cleanString } = require('./strings');

function replacePlaceholders(template, item, environment = {}, options = {}) {
  if (!template) return template;
  const cleaned = cleanString(template);
  const { toJson = false } = options;
  const env = environment && typeof environment === 'object' ? environment : {};
  const resolveValue = (match, pathStr) => {
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

  return cleaned.replace(/\{\{([^{}]+)\}\}|{([^{}]+)}/g, (match, doublePath, singlePath) =>
    resolveValue(match, (doublePath || singlePath).trim()),
  );
}

module.exports = { replacePlaceholders };
