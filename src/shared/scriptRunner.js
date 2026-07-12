// Script Runner - executes JavaScript pre/post request scripts safely
const { createPmApi, clearStepVariables } = require('./scriptHelpers');

class ScriptExecutionError extends Error {
  constructor(message, lineNumber = null) {
    super(message);
    this.name = 'ScriptExecutionError';
    this.lineNumber = lineNumber;
  }
}

async function executeScript(code, context, timeout = 5000) {
  if (!code || !code.trim()) {
    return { success: true, result: null };
  }

  return new Promise((resolve) => {
    let resolved = false;

    const wrappedCode = `
return (async () => {
  ${code}
})()
`;

    const timeoutHandle2 = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({
          success: false,
          error: `Script execution timeout (>${timeout}ms)`,
        });
      }
    }, timeout);

    try {
      // Create execution context with PM API and data
      const pmApi = createPmApi(context.env, {
        log: (...args) => {
          console.log('[Script]', ...args);
        },
        runStep: async (stepId, data) => {
          if (context.callbacks && context.callbacks.runStep) {
            return await context.callbacks.runStep(stepId, data);
          }
          throw new Error('runStep callback not available');
        },
        sendRequest: async (options) => {
          if (context.callbacks && context.callbacks.sendRequest) {
            return await context.callbacks.sendRequest(options);
          }
          throw new Error('sendRequest callback not available');
        },
        retryRequest: async () => {
          if (context.callbacks && context.callbacks.retryRequest) {
            return await context.callbacks.retryRequest();
          }
          throw new Error('retryRequest callback not available');
        },
      }, context.request || {}, context.response || {});

      // Build the execution function with safe globals
      const executionFunction = new Function(
        'pm',
        'env',
        'step',
        'data',
        'response',
        wrappedCode
      );

      // Execute the script
      const result = executionFunction(
        pmApi,
        context.env,
        context.step || {},
        context.data || {},
        pmApi.response || {}
      );

      // Handle both sync and async execution
      if (result && typeof result.then === 'function') {
        result
          .then((asyncResult) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutHandle2);
              resolve({
                success: true,
                result: asyncResult,
                env: context.env,
                request: context.request,
              });
            }
          })
          .catch((err) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutHandle2);
              handleScriptError(err, resolve);
            }
          });
      } else {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutHandle2);
          resolve({
            success: true,
            result,
            env: context.env,
            request: context.request,
          });
        }
      }
    } catch (err) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutHandle2);
        handleScriptError(err, resolve);
      }
    }
  });
}

function handleScriptError(err, resolve) {
  const errorMessage = err.message || String(err);

  // Check for control flow signals
  if (errorMessage === '__SKIP_REQUEST__') {
    return resolve({
      success: true,
      skipRequest: true,
      error: null,
    });
  }

  if (errorMessage.startsWith('__ABORT_COLLECTION__:')) {
    const abortMessage = errorMessage.substring('__ABORT_COLLECTION__:'.length);
    return resolve({
      success: false,
      abortCollection: true,
      error: abortMessage,
    });
  }

  // Regular error
  resolve({
    success: false,
    error: errorMessage,
    stack: err.stack,
  });
}

// Syntax validation - check if code is valid JavaScript
function validateScriptSyntax(code) {
  if (!code || !code.trim()) return { valid: true };

  try {
    new Function(code);
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: err.message,
    };
  }
}

module.exports = {
  executeScript,
  validateScriptSyntax,
  ScriptExecutionError,
  clearStepVariables,
};
