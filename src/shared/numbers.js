// Safe numeric conversions for values that come from the UI or a data file.
// parseInt/parseFloat silently lose precision on long digit strings
// (ids like "00677045499780734996"), and setTimeout overflows above 2^31-1 ms,
// so delays and script timeouts are clamped to sane limits.

const MAX_DELAY_MS = 10 * 60 * 1000; // 10 минут между запросами
const MIN_SCRIPT_TIMEOUT_MS = 1000;
const MAX_SCRIPT_TIMEOUT_MS = 10 * 60 * 1000; // 10 минут на script
const DEFAULT_SCRIPT_TIMEOUT_MS = 5000;

/**
 * Converts a value to an integer clamped to [min, max].
 * Returns `fallback` for non-numeric input instead of silently truncating it
 * (unlike parseInt('10abc') === 10).
 * @param {*} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 * @returns {number}
 */
function clampInt(value, min, max, fallback) {
  // Пустое поле в UI означает "не задано" — берём fallback, а не 0.
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Delay between runner requests, ms. 0 means "no delay".
 * @param {*} value
 * @returns {number}
 */
function clampDelay(value) {
  return clampInt(value, 0, MAX_DELAY_MS, 0);
}

/**
 * Script timeout, ms. Kept inside [1s, 10min] so setTimeout never overflows.
 * @param {*} value
 * @param {number} [fallback]
 * @returns {number}
 */
function clampScriptTimeout(value, fallback = DEFAULT_SCRIPT_TIMEOUT_MS) {
  return clampInt(value, MIN_SCRIPT_TIMEOUT_MS, MAX_SCRIPT_TIMEOUT_MS, fallback);
}

module.exports = {
  MAX_DELAY_MS,
  MIN_SCRIPT_TIMEOUT_MS,
  MAX_SCRIPT_TIMEOUT_MS,
  DEFAULT_SCRIPT_TIMEOUT_MS,
  clampInt,
  clampDelay,
  clampScriptTimeout,
};
