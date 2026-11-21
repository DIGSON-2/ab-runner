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

// ================== Безопасные числовые преобразования ==================
// Renderer не может импортировать CommonJS-модули, поэтому те же помощники
// продублированы здесь (эталон и тесты — src/shared/numbers.js).
// parseInt/parseFloat теряют точность на длинных числах, а setTimeout
// переполняется выше 2^31-1 мс, поэтому значения ограничиваем диапазоном.

export const MAX_DELAY_MS = 10 * 60 * 1000;
export const MIN_SCRIPT_TIMEOUT_MS = 1000;
export const MAX_SCRIPT_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_SCRIPT_TIMEOUT_MS = 5000;

export function clampInt(value, min, max, fallback) {
  // Пустое поле в UI означает "не задано" — берём fallback, а не 0.
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function clampDelay(value) {
  return clampInt(value, 0, MAX_DELAY_MS, 0);
}

export function clampScriptTimeout(value, fallback = DEFAULT_SCRIPT_TIMEOUT_MS) {
  return clampInt(value, MIN_SCRIPT_TIMEOUT_MS, MAX_SCRIPT_TIMEOUT_MS, fallback);
}
