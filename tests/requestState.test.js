const {
  serializeRequestBody,
  validateUnquotedJsonPlaceholders,
  buildRequestBody,
  buildStepRequestState,
  buildStepScriptRequestState,
  finalizeStepRequestState,
  applyRequestStatePlaceholders,
} = require('../src/shared/requestState');

const baseStep = (overrides = {}) => ({
  name: 'Step',
  method: 'POST',
  url: 'https://api.example.com/users/{id}',
  bodyType: 'raw',
  rawType: 'json',
  body: '{"id": "{id}", "name": "test"}',
  customHeaders: [],
  authType: 'noauth',
  ...overrides,
});

describe('buildRequestBody', () => {
  test('none body sends nothing', () => {
    const result = buildRequestBody({ bodyType: 'none' }, {}, {});
    expect(result.data).toBeUndefined();
    expect(result.headers).toEqual({});
  });

  test('raw JSON substitutes placeholders from runner data and env', () => {
    const step = baseStep({
      body: '{"id": "{id}", "token": "{{token}}", "nested": "{user.email}"}',
    });
    const { data } = buildRequestBody(step, { id: 7, user: { email: 'a@b.c' } }, { token: 'tkn' });
    expect(data).toEqual({ id: '7', token: 'tkn', nested: 'a@b.c' });
  });

  test('raw JSON supports unquoted ENV values that are JSON fragments', () => {
    const step = baseStep({ body: '{"carriers": {{carriers}}}' });
    const { data } = buildRequestBody(step, {}, { carriers: '["CDEK","DPD"]' });
    expect(data).toEqual({ carriers: ['CDEK', 'DPD'] });
  });

  test('unquoted placeholder with unknown value produces a clear error', () => {
    const step = baseStep({ body: '{"carriers": {{carriers}}}' });
    expect(() => buildRequestBody(step, {}, {})).toThrow(/carriers.*не найдена/s);
  });

  test('unquoted placeholder with non-JSON value is rejected', () => {
    const step = baseStep({ body: '{"carriers": {{carriers}}}' });
    expect(() => buildRequestBody(step, {}, { carriers: 'CDEK' })).toThrow(/валидным JSON/);
  });

  test('quoted placeholders are not validated as bare JSON values', () => {
    const step = baseStep({ body: '{"carriers": "{{carriers}}"}' });
    expect(() => validateUnquotedJsonPlaceholders(step.body, {}, {})).not.toThrow();
    const { data } = buildRequestBody(step, {}, { carriers: 'CDEK' });
    expect(data).toEqual({ carriers: 'CDEK' });
  });

  test('urlencoded body keeps encoded key/value pairs', () => {
    const step = baseStep({
      bodyType: 'urlencoded',
      urlencoded: [{ key: 'user', value: '{id}', enabled: true }],
    });
    const { data } = buildRequestBody(step, { id: 'A 1' }, {});
    expect(String(data)).toBe('user=A+1');
  });

  test('form-data body exposes the multipart content-type header', () => {
    const step = baseStep({
      bodyType: 'form-data',
      formData: [{ key: 'field', value: 'x', enabled: true }],
    });
    const { headers, data } = buildRequestBody(step, {}, {});
    expect(headers['content-type']).toMatch(/multipart\/form-data; boundary=/);
    expect(typeof data.getBoundary).toBe('function');
  });

  test('graphql body wraps query and parsed variables', () => {
    const step = baseStep({
      bodyType: 'graphql',
      graphql: { query: 'query { me { id } }', variables: '{"id": "{id}"}' },
    });
    const { data } = buildRequestBody(step, { id: 3 }, {});
    expect(data).toEqual({ query: 'query { me { id } }', variables: { id: '3' } });
  });
});

describe('request state for scripts', () => {
  test('buildStepRequestState resolves url, auth header and content type', () => {
    const step = baseStep({ authType: 'bearer', authData: { token: 'abc' } });
    const state = buildStepRequestState(step, { id: 42 }, {});
    expect(state.url).toBe('https://api.example.com/users/42');
    expect(state.headers.Authorization).toBe('Bearer abc');
    expect(state.headers['Content-Type']).toBe('application/json');
    expect(state.body).toEqual({ id: '42', name: 'test' });
  });

  test('script can change headers and body', () => {
    const step = baseStep();
    const state = buildStepScriptRequestState(step, { id: 1 }, {});
    state.headers['X-Custom'] = 'yes';
    state.body = { changed: true };
    finalizeStepRequestState(step, { id: 1 }, {}, state);

    expect(state.headers['X-Custom']).toBe('yes');
    expect(state.body).toEqual({ changed: true });
  });

  test('a header removed by the script stays removed (regression)', () => {
    const step = baseStep({ authType: 'bearer', authData: { token: 'abc' } });
    const state = buildStepScriptRequestState(step, { id: 1 }, {});
    expect(state.headers.Authorization).toBe('Bearer abc');

    // This is what pm.request.headers.remove('Authorization') does.
    delete state.headers.Authorization;
    finalizeStepRequestState(step, { id: 1 }, {}, state);

    expect(state.headers.Authorization).toBeUndefined();
  });

  test('a header set by the script is not overwritten by rebuild', () => {
    const step = baseStep();
    const state = buildStepScriptRequestState(step, { id: 1 }, {});
    state.headers['Content-Type'] = 'application/vnd.api+json';
    finalizeStepRequestState(step, { id: 1 }, {}, state);
    expect(state.headers['Content-Type']).toBe('application/vnd.api+json');
  });

  test('url changed by the script is used and placeholders still resolve', () => {
    const step = baseStep();
    const state = buildStepScriptRequestState(step, { id: 1 }, {});
    state.url = 'https://other.example.com/items/{id}';
    finalizeStepRequestState(step, { id: 9 }, {}, state);
    expect(state.url).toBe('https://other.example.com/items/9');
  });

  test('applyRequestStatePlaceholders resolves headers and url', () => {
    const state = { url: '{{baseUrl}}/{id}', headers: { Authorization: 'Bearer {{token}}' } };
    applyRequestStatePlaceholders(state, { id: 5 }, { baseUrl: 'https://x.test', token: 'tok' });
    expect(state.url).toBe('https://x.test/5');
    expect(state.headers.Authorization).toBe('Bearer tok');
  });

  test('serializeRequestBody keeps strings and stringifies objects', () => {
    expect(serializeRequestBody('raw text')).toBe('raw text');
    expect(serializeRequestBody({ a: 1 })).toBe('{"a":1}');
    expect(serializeRequestBody(null)).toBeNull();
    expect(serializeRequestBody(undefined)).toBeNull();
  });
});
