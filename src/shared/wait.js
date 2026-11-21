// Abortable delay helper shared between the main process and tests.
// A long collection run with a delay used to attach a new "abort" listener on
// every request; listeners were never removed, so a single AbortSignal piled up
// thousands of subscriptions.

const { clampDelay } = require('./numbers');

/**
 * Resolves after `ms` milliseconds, or as soon as `signal` is aborted.
 * Always removes its abort listener, so a long run does not leak.
 * The delay is clamped like the UI value, so a huge number cannot overflow
 * setTimeout (which Node turns into an immediate 1ms timer).
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
function waitForDelay(ms, signal) {
  const delay = clampDelay(ms);
  if (delay <= 0) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', onAbort);
      }
      resolve();
    };
    const onAbort = () => {
      clearTimeout(timer);
      finish();
    };

    if (signal && signal.aborted) {
      resolve();
      return;
    }

    const timer = setTimeout(finish, delay);
    if (signal && typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

module.exports = { waitForDelay };
