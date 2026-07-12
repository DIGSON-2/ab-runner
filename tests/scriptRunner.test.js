const { executeScript } = require('../src/shared/scriptRunner');

describe('executeScript pm API', () => {
  test('lets pre-request scripts mutate the current request', async () => {
    const env = {};
    const request = { method: 'GET', url: 'https://example.com', headers: {}, body: null };

    const result = await executeScript(
      `
      pm.env.set('token', 'abc');
      pm.request.headers.set('Authorization', 'Bearer ' + pm.env.get('token'));
      pm.request.method = 'POST';
      pm.request.data = { ok: true };
      `,
      { env, request },
    );

    expect(result.success).toBe(true);
    expect(env.token).toBe('abc');
    expect(request.method).toBe('POST');
    expect(request.headers.Authorization).toBe('Bearer abc');
    expect(request.body).toEqual({ ok: true });
  });

  test('exposes sendRequest callback to scripts', async () => {
    const result = await executeScript(
      `
      const login = await pm.sendRequest({ method: 'POST', url: 'https://example.com/login' });
      pm.env.set('token', login.data.token);
      `,
      {
        env: {},
        request: { headers: {} },
        callbacks: {
          sendRequest: async (options) => ({
            status: 200,
            data: { token: options.url.endsWith('/login') ? 'from-login' : null },
          }),
        },
      },
    );

    expect(result.success).toBe(true);
    expect(result.env.token).toBe('from-login');
  });

  test('exposes retryRequest callback to post-response scripts', async () => {
    const request = { method: 'GET', url: 'https://example.com/protected', headers: {}, body: null };
    const result = await executeScript(
      `
      pm.env.set('token', 'fresh-token');
      pm.request.headers.set('Authorization', 'Bearer ' + pm.env.get('token'));
      return await pm.retryRequest();
      `,
      {
        env: {},
        request,
        response: { status: 401, data: { errors: [{ status: '401' }] } },
        callbacks: {
          retryRequest: async () => ({
            status: 200,
            data: { ok: true },
          }),
        },
      },
    );

    expect(result.success).toBe(true);
    expect(result.result.status).toBe(200);
    expect(request.headers.Authorization).toBe('Bearer fresh-token');
  });
});
