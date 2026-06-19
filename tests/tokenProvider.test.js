const { extractToken, isTokenValid, makeCacheEntry, cacheKey } = require('../src/shared/tokenProvider');

describe('extractToken', () => {
  test('reads a top-level key', () => {
    expect(extractToken({ token: 'abc' }, 'token')).toBe('abc');
  });

  test('reads a nested dot path', () => {
    expect(extractToken({ data: { access_token: 'xyz' } }, 'data.access_token')).toBe('xyz');
  });

  test('supports array indices in dot and bracket form', () => {
    const body = { items: [{ t: 'first' }, { t: 'second' }] };
    expect(extractToken(body, 'items.1.t')).toBe('second');
    expect(extractToken(body, 'items[0].t')).toBe('first');
  });

  test('coerces non-string primitives to string', () => {
    expect(extractToken({ id: 42 }, 'id')).toBe('42');
  });

  test('returns null for missing path, object value, or bad input', () => {
    expect(extractToken({ a: 1 }, 'b')).toBeNull();
    expect(extractToken({ a: { b: 1 } }, 'a')).toBeNull(); // object, not primitive
    expect(extractToken(null, 'a')).toBeNull();
    expect(extractToken({ a: 1 }, '')).toBeNull();
  });
});

describe('token cache helpers', () => {
  test('isTokenValid respects expiry', () => {
    expect(isTokenValid({ value: 't', expiresAt: 100 }, 50)).toBe(true);
    expect(isTokenValid({ value: 't', expiresAt: 100 }, 100)).toBe(false);
    expect(isTokenValid(undefined, 0)).toBe(false);
    expect(isTokenValid({ value: null, expiresAt: 999 }, 0)).toBe(false);
  });

  test('makeCacheEntry applies ttl in seconds', () => {
    expect(makeCacheEntry('t', 60, 1000)).toEqual({ value: 't', expiresAt: 1000 + 60000 });
  });

  test('makeCacheEntry with ttl<=0 expires immediately (no caching)', () => {
    const entry = makeCacheEntry('t', 0, 1000);
    expect(entry.expiresAt).toBe(1000);
    expect(isTokenValid(entry, 1000)).toBe(false);
  });

  test('cacheKey scopes by variable name', () => {
    expect(cacheKey('colA', 'token')).toBe('colA::token');
    expect(cacheKey('colA', 'token')).not.toBe(cacheKey('colB', 'token'));
  });
});
