// PM API helpers for JavaScript scripting
// Postman-like API for pre/post request scripts

class PMAssert {
  constructor(value) {
    this.value = value;
  }

  equal(expected) {
    if (this.value !== expected) {
      throw new Error(`Assertion failed: ${JSON.stringify(this.value)} !== ${JSON.stringify(expected)}`);
    }
    return this;
  }

  deepEqual(expected) {
    if (JSON.stringify(this.value) !== JSON.stringify(expected)) {
      throw new Error(`Deep assertion failed: ${JSON.stringify(this.value)} !== ${JSON.stringify(expected)}`);
    }
    return this;
  }

  match(regex) {
    if (!regex.test(String(this.value))) {
      throw new Error(`Regex assertion failed: ${this.value} does not match ${regex}`);
    }
    return this;
  }

  includes(substring) {
    if (!String(this.value).includes(substring)) {
      throw new Error(`Includes assertion failed: ${this.value} does not include ${substring}`);
    }
    return this;
  }

  ok() {
    if (!this.value) {
      throw new Error(`Assertion failed: ${this.value} is not truthy`);
    }
    return this;
  }

  isArray() {
    if (!Array.isArray(this.value)) {
      throw new Error(`Assertion failed: ${this.value} is not an array`);
    }
    return this;
  }

  isObject() {
    if (typeof this.value !== 'object' || this.value === null || Array.isArray(this.value)) {
      throw new Error(`Assertion failed: ${this.value} is not an object`);
    }
    return this;
  }
}

// Shared variable storage for step scripts
const stepVariables = new Map();

function createHeadersApi(headers = {}) {
  return {
    all() {
      return headers;
    },

    get(name) {
      const key = Object.keys(headers).find((h) => h.toLowerCase() === String(name).toLowerCase());
      return key ? headers[key] : undefined;
    },

    set(name, value) {
      headers[String(name)] = value == null ? '' : String(value);
    },

    remove(name) {
      const key = Object.keys(headers).find((h) => h.toLowerCase() === String(name).toLowerCase());
      if (key) delete headers[key];
    },

    has(name) {
      return this.get(name) !== undefined;
    },
  };
}

function createBodyApi(requestState) {
  return {
    get() {
      return requestState.body;
    },

    set(value) {
      requestState.body = value;
    },
  };
}

function createRequestApi(requestState = {}) {
  if (!requestState.headers) requestState.headers = {};
  const api = {
    headers: createHeadersApi(requestState.headers),
    body: createBodyApi(requestState),
  };

  Object.defineProperties(api, {
    url: {
      get: () => requestState.url,
      set: (value) => {
        requestState.url = value;
      },
    },
    method: {
      get: () => requestState.method,
      set: (value) => {
        requestState.method = value;
      },
    },
    data: {
      get: () => requestState.body,
      set: (value) => {
        requestState.body = value;
      },
    },
  });

  return api;
}

function createPmApi(stepEnv = {}, callbacks = {}, requestState = {}, response = {}) {
  const envApi = {
    get(name) {
      return stepEnv[name];
    },

    set(name, value) {
      stepEnv[name] = value;
    },

    unset(name) {
      delete stepEnv[name];
    },

    all() {
      return stepEnv;
    },
  };

  return {
    env: envApi,
    request: createRequestApi(requestState),
    response,

    // Variables
    setVar(name, value) {
      stepVariables.set(name, value);
    },

    getVar(name) {
      return stepVariables.get(name);
    },

    // Environment
    getEnv(name) {
      return envApi.get(name);
    },

    setEnv(name, value) {
      envApi.set(name, value);
    },

    // Assertions
    expect(value) {
      return new PMAssert(value);
    },

    // Control flow
    skip() {
      throw new Error('__SKIP_REQUEST__');
    },

    abort(message = 'Aborted by script') {
      throw new Error('__ABORT_COLLECTION__:' + message);
    },

    // Request execution (callback-based)
    async runStep(stepId, data = {}) {
      if (!callbacks.runStep) {
        throw new Error('runStep is not available in this context');
      }
      return await callbacks.runStep(stepId, data);
    },

    async sendRequest(options) {
      if (!callbacks.sendRequest) {
        throw new Error('sendRequest is not available in this context');
      }
      return await callbacks.sendRequest(options);
    },

    // Logging (safe console output)
    log(...args) {
      if (callbacks.log) {
        callbacks.log(...args);
      }
    },
  };
}

function clearStepVariables() {
  stepVariables.clear();
}

module.exports = {
  createPmApi,
  createHeadersApi,
  createRequestApi,
  clearStepVariables,
  PMAssert,
};
