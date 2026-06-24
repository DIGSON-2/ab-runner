// Small DOM-agnostic helpers used across the renderer.

export function escapeHtml(t) {
  return typeof t !== 'string'
    ? t == null
      ? ''
      : String(t)
    : t
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function txt(tag, text, cls) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

export function debounce(fn, d) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), d);
  };
}

// JSON parsing cache (LRU, max 50 entries)
const jsonCache = new Map();
const MAX_CACHE_SIZE = 50;

export function cachedJsonParse(str) {
  if (jsonCache.has(str)) {
    return jsonCache.get(str);
  }

  try {
    const result = JSON.parse(str);
    jsonCache.set(str, result);

    // Evict oldest entry if cache too large
    if (jsonCache.size > MAX_CACHE_SIZE) {
      const firstKey = jsonCache.keys().next().value;
      jsonCache.delete(firstKey);
    }

    return result;
  } catch (e) {
    throw e;
  }
}

export function clearJsonCache() {
  jsonCache.clear();
}

export function toCurl(url, method, headers, body) {
  let curl = `curl -X ${method} "${url}"`;
  if (headers) {
    Object.entries(headers).forEach(([k, v]) => {
      curl += ` -H "${k}: ${v}"`;
    });
  }
  if (body) {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    curl += ` -d '${data.replace(/'/g, "'\\''")}'`;
  }
  return curl;
}
