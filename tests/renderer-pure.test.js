import { trigramSimilarity, getSearchText, collectionRelevance } from '../src/renderer/search.js';
import { formatJSON, parseJsonValue, repairJsonText } from '../src/renderer/jsonFormat.js';
import { parseCurl } from '../src/renderer/curlParser.js';
import { countPostmanRequests } from '../src/renderer/postman.js';

describe('search module', () => {
  test('trigramSimilarity is 1 for identical strings', () => {
    expect(trigramSimilarity('users', 'users')).toBe(1);
  });

  test('collectionRelevance ranks exact name match highest', () => {
    const exact = collectionRelevance({ name: 'login' }, 'login');
    const partial = collectionRelevance({ name: 'login flow' }, 'login');
    const none = collectionRelevance({ name: 'unrelated' }, 'login');
    expect(exact).toBeGreaterThan(partial);
    expect(partial).toBeGreaterThan(none);
  });

  test('getSearchText includes step metadata', () => {
    const text = getSearchText({ name: 'C', steps: [{ name: 'get', method: 'GET', url: '/u' }] });
    expect(text).toContain('get');
    expect(text).toContain('/u');
  });
});

describe('jsonFormat module', () => {
  test('formatJSON pretty-prints compact JSON', () => {
    const out = formatJSON('{"a":1,"b":[2,3]}');
    expect(out).toContain('\n');
    expect(out).toContain('"a": 1');
  });

  test('formatJSON preserves line comments', () => {
    expect(formatJSON('{"a":1} // note')).toContain('// note');
  });

  test('formatJSON handles single-slash comments and closes brackets', () => {
    const out = formatJSON('{"a":[1,2]\n/type: support');
    expect(out).toContain('/type: support');
    expect(out).toContain(']');
    expect(out).toContain('}');
  });

  test('repairJsonText returns valid json without comments', () => {
    expect(JSON.parse(repairJsonText('{"a":[1,2]\n/type: support'))).toEqual({ a: [1, 2] });
  });

  test('parseJsonValue coerces scalars', () => {
    expect(parseJsonValue('42')).toBe(42);
    expect(parseJsonValue('3.5')).toBe(3.5);
    expect(parseJsonValue('true')).toBe(true);
    expect(parseJsonValue('null')).toBeNull();
    expect(parseJsonValue('hello')).toBe('hello');
    expect(parseJsonValue('{"x":1}')).toEqual({ x: 1 });
  });
});

describe('curlParser module', () => {
  test('parses method, url, headers and body', () => {
    const res = parseCurl(
      `curl -X POST 'https://api.example.com/users' -H 'Content-Type: application/json' -d '{"name":"a"}'`,
    );
    expect(res.method).toBe('POST');
    expect(res.url).toBe('https://api.example.com/users');
    expect(res.headers['Content-Type']).toBe('application/json');
    expect(res.body).toBe('{"name":"a"}');
  });

  test('infers POST when body present without explicit method', () => {
    const res = parseCurl(`curl https://x.test -d 'a=1'`);
    expect(res.method).toBe('POST');
  });

  test('returns null for non-curl input', () => {
    expect(parseCurl('wget https://x.test')).toBeNull();
  });
});

describe('postman module', () => {
  test('countPostmanRequests counts nested requests', () => {
    const items = [{ request: {} }, { item: [{ request: {} }, { item: [{ request: {} }] }] }];
    expect(countPostmanRequests(items)).toBe(3);
  });
});
