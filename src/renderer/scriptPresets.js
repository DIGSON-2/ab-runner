export const DEFAULT_SCRIPT_PRESETS = [
  {
    id: 'refresh-token-on-401',
    title: 'Обновить token при 401',
    description: 'Добавляет Bearer token перед запросом, при 401 получает новый token и повторяет запрос.',
    prerequest: [
      "const token = pm.env.get('token');",
      '',
      'if (token) {',
      "  pm.request.headers.set('Authorization', 'Bearer ' + token);",
      '}',
    ].join('\n'),
    postresponse: [
      'const responseText = JSON.stringify(pm.response.data || {});',
      'const isUnauthorized =',
      '  pm.response.status === 401 ||',
      "  pm.response.data?.errors?.some((error) => String(error.status) === '401') ||",
      "  /expired|jwt|token|unauthorized/i.test(responseText);",
      '',
      'if (isUnauthorized) {',
      "  const loginUrl = pm.env.get('loginUrl');",
      "  const username = pm.env.get('username');",
      "  const password = pm.env.get('password');",
      '',
      '  if (!loginUrl) {',
      "    throw new Error('ENV loginUrl is required to refresh token');",
      '  }',
      '',
      '  const loginResponse = await pm.sendRequest({',
      "    method: 'POST',",
      '    url: loginUrl,',
      "    headers: { 'Content-Type': 'application/json' },",
      '    body: { username, password },',
      '  });',
      '',
      '  const nextToken =',
      '    loginResponse.data?.token ||',
      '    loginResponse.data?.access_token ||',
      '    loginResponse.data?.data?.token ||',
      '    loginResponse.data?.data?.access_token;',
      '',
      '  if (!nextToken) {',
      "    throw new Error('Token was not found in login response');",
      '  }',
      '',
      "  pm.env.set('token', nextToken);",
      "  pm.request.headers.set('Authorization', 'Bearer ' + nextToken);",
      '',
      '  return await pm.retryRequest();',
      '}',
    ].join('\n'),
  },
];

export function generatePresetId() {
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function cloneScriptPreset(preset) {
  return {
    id: preset.id || generatePresetId(),
    title: preset.title || 'Новый пресет',
    description: preset.description || '',
    prerequest: preset.prerequest || '',
    postresponse: preset.postresponse || '',
  };
}

export function normalizeScriptPresets(data) {
  if (!Array.isArray(data.scriptPresets)) data.scriptPresets = [];
  if (data.scriptPresets.length === 0) data.scriptPresets = DEFAULT_SCRIPT_PRESETS.map(cloneScriptPreset);
  data.scriptPresets = data.scriptPresets.map(cloneScriptPreset);
}
