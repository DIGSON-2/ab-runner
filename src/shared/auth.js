// Authorization / header construction shared between the main process and tests.
const crypto = require('crypto');
const { replacePlaceholders } = require('./placeholders');

const RAW_CONTENT_TYPES = {
  json: 'application/json',
  javascript: 'application/javascript',
  xml: 'application/xml',
  html: 'text/html',
  text: 'text/plain',
};

function applyCustomHeaders(headers, step) {
  if (Array.isArray(step.customHeaders)) {
    step.customHeaders.forEach((h) => {
      if (h && h.enabled !== false && h.key && h.key.trim()) {
        headers[h.key.trim()] = h.value || '';
      }
    });
  } else if (step.customHeaders && typeof step.customHeaders === 'object') {
    Object.entries(step.customHeaders).forEach(([key, value]) => {
      if (key && key.trim()) headers[key.trim()] = value || '';
    });
  }
}

function applyContentType(headers, step) {
  const bodyType = step.bodyType || (step.body ? 'raw' : 'none');
  const rawType = step.rawType || 'json';

  switch (bodyType) {
    case 'none':
    case 'form-data':
      break;
    case 'urlencoded':
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/x-www-form-urlencoded';
      break;
    case 'raw':
      if (!headers['Content-Type']) {
        headers['Content-Type'] = RAW_CONTENT_TYPES[rawType] || step.contentType || 'application/json';
      }
      break;
    case 'binary':
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/octet-stream';
      break;
    case 'graphql':
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
      break;
    default:
      if (step.contentType && step.contentType.trim() && !headers['Content-Type']) {
        headers['Content-Type'] = step.contentType.trim();
      }
  }
}

function buildDigestHeader(authData, url, method, body) {
  const { username, password, realm, nonce, qop = 'auth', nonceCount = '00000001', opaque } = authData;
  const declaredAlgorithm = (authData.algorithm || 'MD5').toLowerCase();
  const isSess = declaredAlgorithm.endsWith('-sess');
  // crypto.createHash does not understand the "-sess" suffix; strip it for hashing.
  const hashAlgorithm = isSess ? declaredAlgorithm.replace('-sess', '') : declaredAlgorithm;
  const cnonce = authData.cnonce || crypto.randomBytes(8).toString('hex');

  if (!(username && password && realm && nonce)) return null;

  let uri = url;
  try {
    const parsed = new URL(url);
    uri = parsed.pathname + parsed.search;
  } catch (e) {
    console.error('Digest Auth: invalid URL, using raw value:', e.message);
  }

  let ha1 = crypto.createHash(hashAlgorithm).update(`${username}:${realm}:${password}`).digest('hex');
  if (isSess) {
    ha1 = crypto.createHash(hashAlgorithm).update(`${ha1}:${nonce}:${cnonce}`).digest('hex');
  }

  let ha2 = crypto.createHash(hashAlgorithm).update(`${method.toUpperCase()}:${uri}`).digest('hex');
  if (qop === 'auth-int') {
    const bodyHash = crypto
      .createHash(hashAlgorithm)
      .update(body || '')
      .digest('hex');
    ha2 = crypto.createHash(hashAlgorithm).update(`${method.toUpperCase()}:${uri}:${bodyHash}`).digest('hex');
  }

  let response;
  if (qop === 'auth' || qop === 'auth-int') {
    response = crypto
      .createHash(hashAlgorithm)
      .update(`${ha1}:${nonce}:${nonceCount}:${cnonce}:${qop}:${ha2}`)
      .digest('hex');
  } else {
    response = crypto.createHash(hashAlgorithm).update(`${ha1}:${nonce}:${ha2}`).digest('hex');
  }

  let authHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", algorithm=${declaredAlgorithm.toUpperCase()}, response="${response}"`;
  if (qop) authHeader += `, qop=${qop}, nc=${nonceCount}, cnonce="${cnonce}"`;
  if (opaque) authHeader += `, opaque="${opaque}"`;
  return authHeader;
}

function buildOAuth1Header(authData, url, method) {
  const {
    consumerKey,
    consumerSecret,
    token,
    tokenSecret,
    signatureMethod = 'HMAC-SHA1',
    realm,
    addTo = 'header',
  } = authData;
  const timestamp = authData.timestamp || Math.floor(Date.now() / 1000).toString();
  const nonce = authData.nonce || crypto.randomBytes(16).toString('hex');
  const version = authData.version || '1.0';

  if (!(consumerKey && addTo === 'header')) return null;

  const params = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: signatureMethod,
    oauth_timestamp: timestamp,
    oauth_version: version,
  };
  if (token) params.oauth_token = token;
  if (realm) params.realm = realm;

  let baseUrl = url;
  try {
    const urlObj = new URL(url);
    baseUrl = urlObj.origin + urlObj.pathname;
    urlObj.searchParams.forEach((value, key) => {
      params[key] = value;
    });
  } catch (e) {
    console.error('OAuth 1.0: invalid URL, using raw value:', e.message);
  }

  const sortedParams = Object.keys(params)
    .filter((k) => k !== 'realm')
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  const baseString = `${method.toUpperCase()}&${encodeURIComponent(baseUrl)}&${encodeURIComponent(sortedParams)}`;
  const signingKey = `${encodeURIComponent(consumerSecret || '')}&${encodeURIComponent(tokenSecret || '')}`;

  let signature;
  if (signatureMethod === 'HMAC-SHA256') {
    signature = crypto.createHmac('sha256', signingKey).update(baseString).digest('base64');
  } else if (signatureMethod === 'PLAINTEXT') {
    signature = signingKey;
  } else {
    signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
  }

  params.oauth_signature = signature;
  let authHeader = 'OAuth ';
  if (realm) authHeader += `realm="${encodeURIComponent(realm)}", `;
  authHeader += Object.keys(params)
    .filter((k) => k !== 'realm')
    .map((key) => `${encodeURIComponent(key)}="${encodeURIComponent(params[key])}"`)
    .join(', ');
  return authHeader;
}

function buildHawkHeader(authData, url, method, body, contentType) {
  const { hawkId: id, hawkKey: key, algorithm = 'sha256', ext, app, dlg } = authData;
  const nonce = authData.nonce || crypto.randomBytes(6).toString('hex');
  const timestamp = authData.timestamp || Math.floor(Date.now() / 1000).toString();

  if (!(id && key)) return null;

  const urlObj = new URL(url);
  const host = urlObj.hostname;
  const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
  const resource = urlObj.pathname + urlObj.search;

  let normalized = `hawk.1.header\n${timestamp}\n${nonce}\n${method.toUpperCase()}\n${resource}\n${host}\n${port}\n`;
  if (body) {
    const payloadHash = crypto
      .createHash(algorithm)
      .update(`hawk.1.payload\n${contentType || ''}\n${body}`)
      .digest('base64');
    normalized += `${payloadHash}\n`;
  } else {
    normalized += '\n';
  }
  normalized += `${ext || ''}\n`;
  if (app) normalized += `${app}\n${dlg || ''}\n`;

  const mac = crypto.createHmac(algorithm, key).update(normalized).digest('base64');
  let authHeader = `Hawk id="${id}", ts="${timestamp}", nonce="${nonce}", mac="${mac}"`;
  if (ext) authHeader += `, ext="${ext.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  if (app) {
    authHeader += `, app="${app}"`;
    if (dlg) authHeader += `, dlg="${dlg}"`;
  }
  return authHeader;
}

function applyAuth(headers, step, url, method) {
  const authType = step.authType || (step.auth && step.auth.trim() ? 'bearer' : 'noauth');
  const authData = step.authData || {};
  const legacyToken = step.auth && step.auth.trim() ? step.auth.trim() : '';

  switch (authType) {
    case 'noauth':
      break;
    case 'apikey':
      if (authData.key && authData.addTo === 'header') headers[authData.key] = authData.value || '';
      break;
    case 'bearer':
      if (authData.token || legacyToken) headers['Authorization'] = `Bearer ${authData.token || legacyToken}`;
      break;
    case 'jwt':
      if (authData.token) headers['Authorization'] = `${authData.prefix || 'Bearer'} ${authData.token}`;
      break;
    case 'basic':
      if (authData.username || authData.password) {
        headers['Authorization'] =
          `Basic ${Buffer.from(`${authData.username || ''}:${authData.password || ''}`).toString('base64')}`;
      }
      break;
    case 'digest': {
      try {
        const header = buildDigestHeader(authData, url, method, step.body);
        if (header) headers['Authorization'] = header;
      } catch (e) {
        console.error('Digest Auth error:', e);
      }
      break;
    }
    case 'oauth2':
      if (authData.accessToken && authData.addTo === 'header') {
        headers['Authorization'] = `${authData.headerPrefix || 'Bearer'} ${authData.accessToken}`;
      }
      break;
    case 'oauth1': {
      try {
        const header = buildOAuth1Header(authData, url, method);
        if (header) headers['Authorization'] = header;
      } catch (e) {
        console.error('OAuth 1.0 error:', e);
      }
      break;
    }
    case 'hawk': {
      try {
        const header = buildHawkHeader(authData, url, method, step.body, headers['Content-Type']);
        if (header) headers['Authorization'] = header;
      } catch (e) {
        console.error('Hawk Auth error:', e);
      }
      break;
    }
    default:
      if (legacyToken) headers['Authorization'] = `Bearer ${legacyToken}`;
  }
}

function buildHeaders(step, url = '', method = 'GET', item, env) {
  const headers = {};
  applyCustomHeaders(headers, step);
  applyContentType(headers, step);
  applyAuth(headers, step, url, method);
  // Resolve placeholders (e.g. {token}) in header values when data/env is given.
  if (item !== undefined || env !== undefined) {
    for (const key of Object.keys(headers)) {
      headers[key] = replacePlaceholders(headers[key], item ?? null, env || {});
    }
  }
  return headers;
}

module.exports = { buildHeaders };
