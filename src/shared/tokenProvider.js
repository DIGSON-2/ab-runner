// Pure logic for declarative pre-request token chaining.
// The network call (running the login request) lives in the main process; this
// module only handles token extraction from a response and TTL caching, so it
// can be unit tested without a DOM or network.

/**
 * Read a value out of a parsed JSON response by a dot/bracket path.
 * Supports dot notation and array indices, e.g.:
 *   "data.token", "data.items.0.value", "items[0].token".
 * Returns the value as a string, or null if the path does not resolve to a
 * primitive (objects/arrays/missing keys yield null).
 * @param {*} obj
 * @param {string} path
 * @returns {string|null}
 */
function extractToken(obj, path) {
  if (obj == null || typeof path !== 'string' || !path.trim()) return null;
  const keys = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  let value = obj;
  for (const key of keys) {
    if (value == null || typeof value !== 'object') return null;
    if (!(key in value)) return null;
    value = value[key];
  }
  if (value == null || typeof value === 'object') return null;
  return String(value);
}

/**
 * Whether a cache entry is still usable at time `now`.
 * A ttl of 0 means "never cache" (always considered expired).
 * @param {{value: string, expiresAt: number}|undefined} entry
 * @param {number} now - epoch ms
 * @returns {boolean}
 */
function isTokenValid(entry, now) {
  if (!entry || entry.value == null) return false;
  return entry.expiresAt > now;
}

/**
 * Build a cache entry for a freshly fetched token.
 * @param {string} value
 * @param {number} ttlSeconds - seconds; <= 0 means do not cache (expires immediately)
 * @param {number} now - epoch ms
 * @returns {{value: string, expiresAt: number}}
 */
function makeCacheEntry(value, ttlSeconds, now) {
  const ttl = Number(ttlSeconds);
  const ms = Number.isFinite(ttl) && ttl > 0 ? ttl * 1000 : 0;
  return { value, expiresAt: now + ms };
}

/**
 * Stable cache key for a token, scoped so different collections/variables don't
 * clash.
 * @param {string} scope
 * @param {string} tokenVar
 * @returns {string}
 */
function cacheKey(scope, tokenVar) {
  return `${scope || ''}::${tokenVar || 'token'}`;
}

module.exports = { extractToken, isTokenValid, makeCacheEntry, cacheKey };
