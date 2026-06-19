const crypto = require('crypto');
const { buildHeaders } = require('../src/shared/auth');

describe('buildHeaders - custom headers & content type', () => {
  test('applies enabled array headers and trims keys', () => {
    const headers = buildHeaders({
      customHeaders: [
        { key: ' X-A ', value: '1', enabled: true },
        { key: 'X-B', value: '2', enabled: false },
      ],
    });
    expect(headers['X-A']).toBe('1');
    expect(headers['X-B']).toBeUndefined();
  });

  test('sets JSON content-type for raw json body', () => {
    const headers = buildHeaders({ bodyType: 'raw', rawType: 'json' });
    expect(headers['Content-Type']).toBe('application/json');
  });

  test('sets urlencoded content-type', () => {
    const headers = buildHeaders({ bodyType: 'urlencoded' });
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  test('does not override an explicit content-type', () => {
    const headers = buildHeaders({
      bodyType: 'raw',
      rawType: 'json',
      customHeaders: [{ key: 'Content-Type', value: 'application/xml', enabled: true }],
    });
    expect(headers['Content-Type']).toBe('application/xml');
  });
});

describe('buildHeaders - auth schemes', () => {
  test('bearer token', () => {
    const headers = buildHeaders({ authType: 'bearer', authData: { token: 'abc' } });
    expect(headers['Authorization']).toBe('Bearer abc');
  });

  test('legacy auth string falls back to bearer', () => {
    const headers = buildHeaders({ auth: 'legacy' });
    expect(headers['Authorization']).toBe('Bearer legacy');
  });

  test('basic auth base64-encodes credentials', () => {
    const headers = buildHeaders({ authType: 'basic', authData: { username: 'u', password: 'p' } });
    expect(headers['Authorization']).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
  });

  test('apikey added to header', () => {
    const headers = buildHeaders({ authType: 'apikey', authData: { key: 'X-Api-Key', value: 'k', addTo: 'header' } });
    expect(headers['X-Api-Key']).toBe('k');
  });
});

describe('buildHeaders - digest', () => {
  const base = {
    authType: 'digest',
    authData: { username: 'u', password: 'p', realm: 'r', nonce: 'n', cnonce: 'c', algorithm: 'MD5' },
  };

  test('produces a valid MD5 digest response', () => {
    const headers = buildHeaders(base, 'https://example.com/path?q=1', 'GET');
    const ha1 = crypto.createHash('md5').update('u:r:p').digest('hex');
    const ha2 = crypto.createHash('md5').update('GET:/path?q=1').digest('hex');
    const expected = crypto.createHash('md5').update(`${ha1}:n:00000001:c:auth:${ha2}`).digest('hex');
    expect(headers['Authorization']).toContain(`response="${expected}"`);
    expect(headers['Authorization']).toContain('algorithm=MD5');
  });

  test('md5-sess does not throw and emits header (regression)', () => {
    const headers = buildHeaders(
      { authType: 'digest', authData: { ...base.authData, algorithm: 'MD5-sess' } },
      'https://example.com/path',
      'GET',
    );
    expect(headers['Authorization']).toContain('algorithm=MD5-SESS');
    expect(headers['Authorization']).toMatch(/response="[a-f0-9]{32}"/);
  });
});

describe('buildHeaders - oauth1', () => {
  test('deterministic HMAC-SHA1 signature with fixed nonce/timestamp', () => {
    const headers = buildHeaders(
      {
        authType: 'oauth1',
        authData: {
          consumerKey: 'ck',
          consumerSecret: 'cs',
          token: 'tk',
          tokenSecret: 'ts',
          nonce: 'fixednonce',
          timestamp: '1700000000',
          addTo: 'header',
        },
      },
      'https://example.com/resource',
      'GET',
    );
    expect(headers['Authorization']).toMatch(/^OAuth /);
    expect(headers['Authorization']).toContain('oauth_signature=');
    expect(headers['Authorization']).toContain('oauth_nonce="fixednonce"');
  });
});

describe('buildHeaders - hawk', () => {
  test('builds a Hawk header with mac', () => {
    const headers = buildHeaders(
      {
        authType: 'hawk',
        authData: { hawkId: 'id', hawkKey: 'key', nonce: 'abc', timestamp: '1700000000' },
      },
      'https://example.com/resource',
      'POST',
    );
    expect(headers['Authorization']).toMatch(/^Hawk id="id"/);
    expect(headers['Authorization']).toContain('mac="');
  });
});
