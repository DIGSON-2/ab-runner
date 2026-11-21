const { waitForDelay } = require('../src/shared/wait');
const { MAX_DELAY_MS } = require('../src/shared/numbers');

// Minimal AbortSignal stand-in so listener bookkeeping is observable.
function makeSignal() {
  const listeners = new Set();
  return {
    aborted: false,
    addEventListener(type, listener) {
      if (type === 'abort') listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === 'abort') listeners.delete(listener);
    },
    abort() {
      this.aborted = true;
      [...listeners].forEach((listener) => listener());
      listeners.clear();
    },
    listenerCount: () => listeners.size,
  };
}

describe('waitForDelay', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('resolves after the delay', async () => {
    const promise = waitForDelay(500);
    jest.advanceTimersByTime(499);
    let done = false;
    promise.then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);

    jest.advanceTimersByTime(1);
    await promise;
    expect(done).toBe(true);
  });

  test('resolves immediately for zero or invalid delays', async () => {
    await expect(waitForDelay(0)).resolves.toBeUndefined();
    await expect(waitForDelay(-5)).resolves.toBeUndefined();
    await expect(waitForDelay('nope')).resolves.toBeUndefined();
  });

  test('resolves early when the signal is already aborted', async () => {
    const signal = makeSignal();
    signal.abort();
    await expect(waitForDelay(10000, signal)).resolves.toBeUndefined();
  });

  test('removes its abort listener after a normal delay (no leak on long runs)', async () => {
    const signal = makeSignal();
    const promise = waitForDelay(100, signal);
    expect(signal.listenerCount()).toBe(1);
    jest.advanceTimersByTime(100);
    await promise;
    expect(signal.listenerCount()).toBe(0);
  });

  test('removes its abort listener when aborted', async () => {
    const signal = makeSignal();
    const promise = waitForDelay(10000, signal);
    signal.abort();
    await promise;
    expect(signal.listenerCount()).toBe(0);
  });

  test('clamps huge delays instead of overflowing setTimeout', async () => {
    const promise = waitForDelay(Number.MAX_SAFE_INTEGER);
    jest.advanceTimersByTime(MAX_DELAY_MS - 1);
    let done = false;
    promise.then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);

    jest.advanceTimersByTime(1);
    await promise;
    expect(done).toBe(true);
  });
});
