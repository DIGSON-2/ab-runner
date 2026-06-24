// PM API helpers for JavaScript scripting
// Postman-like API for pre/post request scripts

class PMAssert {
  constructor(value, testName, pm) {
    this.value = value;
    this.testName = testName;
    this.pm = pm;
  }

  _record(success, error = null) {
    if (this.pm && this.pm._tests) {
      this.pm._tests.push({
        name: this.testName,
        success,
        error,
      });
    }
    if (!success && error) {
      throw new Error(error);
    }
    return this;
  }

  equal(expected) {
    const success = this.value === expected;
    return this._record(
      success,
      success ? null : `Assertion failed: ${JSON.stringify(this.value)} !== ${JSON.stringify(expected)}`,
    );
  }

  deepEqual(expected) {
    const success = JSON.stringify(this.value) === JSON.stringify(expected);
    return this._record(
      success,
      success ? null : `Deep assertion failed: ${JSON.stringify(this.value)} !== ${JSON.stringify(expected)}`,
    );
  }

  match(regex) {
    const success = regex.test(String(this.value));
    return this._record(
      success,
      success ? null : `Regex assertion failed: ${this.value} does not match ${regex}`,
    );
  }

  includes(substring) {
    const success = String(this.value).includes(substring);
    return this._record(
      success,
      success ? null : `Includes assertion failed: ${this.value} does not include ${substring}`,
    );
  }

  ok() {
    const success = !!this.value;
    return this._record(success, success ? null : `Assertion failed: ${this.value} is not truthy`);
  }

  isArray() {
    const success = Array.isArray(this.value);
    return this._record(success, success ? null : `Assertion failed: ${this.value} is not an array`);
  }

  isObject() {
    const success = typeof this.value === 'object' && this.value !== null && !Array.isArray(this.value);
    return this._record(success, success ? null : `Assertion failed: ${this.value} is not an object`);
  }
}

// Shared variable storage for step scripts
const stepVariables = new Map();

function createPmApi(stepEnv = {}, callbacks = {}) {
  const pm = {
    _tests: [],
    // Variables
    setVar(name, value) {
      stepVariables.set(name, value);
    },

    getVar(name) {
      return stepVariables.get(name);
    },

    // Environment
    getEnv(name) {
      return stepEnv[name];
    },

    setEnv(name, value) {
      stepEnv[name] = value;
    },

    // Assertions
    test(name, fn) {
      try {
        fn();
      } catch (e) {
        // Error already recorded by expect or is a general script error
        if (!pm._tests.some((t) => t.name === name)) {
          pm._tests.push({ name, success: false, error: e.message });
        }
      }
    },

    expect(value, name = 'Assertion') {
      return new PMAssert(value, name, pm);
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

    getTests() {
      return pm._tests;
    },
  };
  return pm;
}

function clearStepVariables() {
  stepVariables.clear();
}

module.exports = {
  createPmApi,
  clearStepVariables,
  PMAssert,
};
