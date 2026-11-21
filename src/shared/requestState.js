// Builds the concrete HTTP request for a step: placeholders, auth headers,
// bodies of every supported type, and the state a pre-request script may mutate.
// Kept free of Electron so it can be unit tested with plain Node.

const fs = require('fs');
const FormData = require('form-data');
const { repairJsonText } = require('./strings');
const { replacePlaceholders } = require('./placeholders');
const { buildHeaders } = require('./auth');

function serializeRequestBody(data) {
  return typeof data === 'string' ? data : data == null ? null : JSON.stringify(data);
}

const PLACEHOLDER_PATH = '[A-Za-z0-9_$-]+(?:\\.[A-Za-z0-9_$-]+)*';

/**
 * A placeholder used as a bare JSON value (no quotes) must resolve to valid
 * JSON, otherwise the request would silently send broken JSON.
 * @param {string} template
 * @param {*} item
 * @param {Object} env
 */
function validateUnquotedJsonPlaceholders(template, item, env) {
  const placeholderRegex = new RegExp(
    `\\{\\{\\s*(${PLACEHOLDER_PATH})\\s*\\}\\}|(?<!\\{)\\{(${PLACEHOLDER_PATH})\\}(?!\\})`,
    'g',
  );
  let match;

  while ((match = placeholderRegex.exec(template)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (template[start - 1] === '"' && template[end] === '"') continue;

    const name = (match[1] || match[2] || '').trim();
    const resolved = replacePlaceholders(match[0], item, env, { toJson: true });

    if (resolved === match[0]) {
      throw new Error(`Переменная "${name}" не найдена, но используется как JSON-значение без кавычек`);
    }

    if (!String(resolved).trim()) {
      throw new Error(`Переменная "${name}" пустая. Если это массив, укажите в ENV значение вроде [] или ["A","B"]`);
    }

    try {
      JSON.parse(resolved);
    } catch {
      throw new Error(
        `Переменная "${name}" должна быть валидным JSON, потому что используется без кавычек. Например: [], ["A","B"], {"id":1}`,
      );
    }
  }
}

/**
 * @param {Object} step
 * @param {*} item current runner data object
 * @param {Object} env environment variables
 * @returns {{data: *, headers: Object}}
 */
function buildRequestBody(step, item, env) {
  const bodyType = step.bodyType || 'raw';

  switch (bodyType) {
    case 'none':
      return { data: undefined, headers: {} };
    case 'form-data': {
      const form = new FormData();
      if (Array.isArray(step.formData)) {
        step.formData.forEach((field) => {
          if (!field || field.enabled === false || !field.key) return;
          const key = replacePlaceholders(field.key, item, env);
          if (field.type === 'file' && field.filePath) {
            try {
              form.append(key, fs.createReadStream(field.filePath));
            } catch (e) {
              console.error('Ошибка чтения файла:', field.filePath, e);
            }
          } else {
            form.append(key, replacePlaceholders(field.value || '', item, env));
          }
        });
      }
      return { data: form, headers: form.getHeaders() };
    }
    case 'urlencoded': {
      const params = new URLSearchParams();
      if (Array.isArray(step.urlencoded)) {
        step.urlencoded.forEach((field) => {
          if (!field || field.enabled === false || !field.key) return;
          params.append(replacePlaceholders(field.key, item, env), replacePlaceholders(field.value || '', item, env));
        });
      }
      return { data: params, headers: {} };
    }
    case 'raw': {
      if (step.rawType === 'json') validateUnquotedJsonPlaceholders(step.body || '', item, env);
      let body = replacePlaceholders(step.body || '', item, env, { toJson: true });
      let data;
      if (step.rawType === 'json') {
        body = repairJsonText(body);
        data = JSON.parse(body);
      } else {
        data = body;
      }
      return { data, headers: {} };
    }
    case 'binary': {
      if (step.binaryPath && fs.existsSync(step.binaryPath)) {
        return { data: fs.readFileSync(step.binaryPath), headers: {} };
      }
      return { data: undefined, headers: {} };
    }
    case 'graphql': {
      // GraphQL uses braces for field selection: `query { id name }` must not be
      // treated as runner placeholders, so only {{env}} variables are resolved.
      const query = replacePlaceholders(step.graphql?.query || '', item, env, { allowSingle: false });
      let variables = {};
      if (step.graphql?.variables && step.graphql.variables.trim()) {
        try {
          variables = JSON.parse(replacePlaceholders(step.graphql.variables, item, env, { toJson: true }));
        } catch (e) {
          console.error('GraphQL variables parse error:', e.message);
        }
      }
      return { data: { query, variables }, headers: {} };
    }
    default:
      return { data: undefined, headers: {} };
  }
}

function buildStepRequestState(step, item, env) {
  const url = replacePlaceholders(step.url, item, env);
  const { data, headers: bodyHeaders } = buildRequestBody(step, item, env);
  return {
    method: step.method || 'GET',
    url,
    headers: { ...buildHeaders(step, url, step.method, item, env), ...bodyHeaders },
    body: data,
  };
}

// State handed to a pre-request script: headers/body are mutable and remembered.
function buildStepScriptRequestState(step, item, env) {
  const url = replacePlaceholders(step.url, item, env);
  const initialBody = step.bodyType === 'raw' ? step.body || '' : undefined;
  const headers = buildHeaders(step, url, step.method, item, env);
  return {
    method: step.method || 'GET',
    url,
    headers,
    body: initialBody,
    __initialBody: initialBody,
    // Snapshot so "script removed this header" can be told apart from
    // "the header reappeared when the request was rebuilt".
    __initialHeaders: { ...headers },
  };
}

/**
 * Merges script changes back into a request state built by
 * buildStepScriptRequestState.
 */
function finalizeStepRequestState(step, item, env, state) {
  const finalUrl = replacePlaceholders(state.url, item, env);
  const bodyWasChangedByScript = state.body !== state.__initialBody;
  const { data, headers: bodyHeaders } = bodyWasChangedByScript
    ? { data: state.body, headers: {} }
    : buildRequestBody(step, item, env);
  const scriptHeaders = { ...(state.headers || {}) };
  const rebuiltHeaders = {
    ...buildHeaders(step, finalUrl, state.method, item, env),
    ...bodyHeaders,
    ...scriptHeaders,
  };

  // pm.request.headers.remove(...) must stick: headers that existed in the
  // initial state and disappeared are not re-added.
  const initialHeaders = state.__initialHeaders || {};
  Object.keys(initialHeaders).forEach((key) => {
    if (!(key in scriptHeaders)) delete rebuiltHeaders[key];
  });

  delete state.__initialBody;
  delete state.__initialHeaders;
  state.url = finalUrl;
  state.headers = rebuiltHeaders;
  state.body = data;
  return state;
}

function applyRequestStatePlaceholders(state, item, env) {
  state.url = replacePlaceholders(state.url, item, env);
  Object.keys(state.headers || {}).forEach((key) => {
    state.headers[key] = replacePlaceholders(state.headers[key], item, env);
  });
  return state;
}

module.exports = {
  serializeRequestBody,
  validateUnquotedJsonPlaceholders,
  buildRequestBody,
  buildStepRequestState,
  buildStepScriptRequestState,
  finalizeStepRequestState,
  applyRequestStatePlaceholders,
};
