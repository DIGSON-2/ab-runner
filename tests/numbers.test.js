const {
  MAX_DELAY_MS,
  MIN_SCRIPT_TIMEOUT_MS,
  MAX_SCRIPT_TIMEOUT_MS,
  clampInt,
  clampDelay,
  clampScriptTimeout,
} = require('../src/shared/numbers');
const {
  clampInt: rendererClampInt,
  clampDelay: rendererClampDelay,
  clampScriptTimeout: rendererClampScriptTimeout,
} = require('../src/renderer/utils.js');

describe('clampInt', () => {
  test('keeps in-range integers', () => {
    expect(clampInt(10, 1, 30, 5)).toBe(10);
    expect(clampInt('10', 1, 30, 5)).toBe(10);
  });

  test('clamps to the bounds', () => {
    expect(clampInt(-5, 0, 30, 5)).toBe(0);
    expect(clampInt(99, 0, 30, 5)).toBe(30);
  });

  test('rounds fractional values', () => {
    expect(clampInt(10.4, 0, 30, 5)).toBe(10);
    expect(clampInt(10.6, 0, 30, 5)).toBe(11);
  });

  test('falls back for non-numeric input instead of parseInt-style truncation', () => {
    expect(clampInt('10abc', 0, 30, 5)).toBe(5);
    expect(clampInt(undefined, 0, 30, 5)).toBe(5);
    expect(clampInt(null, 0, 30, 5)).toBe(5);
    expect(clampInt(NaN, 0, 30, 5)).toBe(5);
    expect(clampInt(Infinity, 0, 30, 5)).toBe(5);
  });

  test('treats an empty UI field as "not set" and uses the fallback', () => {
    expect(clampInt('', 0, 30, 5)).toBe(5);
    expect(clampInt('   ', 0, 30, 5)).toBe(5);
    expect(clampInt('', 0, 30, 0)).toBe(0);
  });

  test('never returns unsafe or out-of-range integers for long digit strings', () => {
    // parseInt would give 677045499780735000 for this input; clampInt caps it
    // to the allowed range and always returns a safe integer.
    expect(clampInt('00677045499780734996', 0, Number.MAX_SAFE_INTEGER, 1)).toBe(Number.MAX_SAFE_INTEGER);
    expect(clampInt('999999999999999999999', 0, 1000, 1)).toBe(1000);
    expect(Number.isSafeInteger(clampInt('999999999999999999999', 0, 1000, 1))).toBe(true);
    expect(Number.isSafeInteger(clampInt('9007199254740993', 0, Number.MAX_SAFE_INTEGER, 1))).toBe(true);
  });
});

describe('clampDelay', () => {
  test('0 and negatives mean no delay', () => {
    expect(clampDelay('')).toBe(0);
    expect(clampDelay('-100')).toBe(0);
    expect(clampDelay(0)).toBe(0);
  });

  test('clamps huge delays to one day', () => {
    expect(clampDelay(1000)).toBe(1000);
    expect(clampDelay('1e21')).toBe(MAX_DELAY_MS);
    expect(clampDelay(Number.MAX_SAFE_INTEGER)).toBe(MAX_DELAY_MS);
  });

  test('fallback for garbage is 0', () => {
    expect(clampDelay('abc')).toBe(0);
  });
});

describe('clampScriptTimeout', () => {
  test('keeps normal timeouts', () => {
    expect(clampScriptTimeout(5000)).toBe(5000);
    expect(clampScriptTimeout('15000')).toBe(15000);
  });

  test('clamps to [1s, 10min]', () => {
    expect(clampScriptTimeout(10)).toBe(MIN_SCRIPT_TIMEOUT_MS);
    expect(clampScriptTimeout(0)).toBe(MIN_SCRIPT_TIMEOUT_MS);
    expect(clampScriptTimeout(99999999)).toBe(MAX_SCRIPT_TIMEOUT_MS);
  });

  test('uses the fallback for garbage', () => {
    expect(clampScriptTimeout('abc', 10000)).toBe(10000);
    expect(clampScriptTimeout(undefined, 7000)).toBe(7000);
  });
});

describe('renderer copies of the number helpers', () => {
  // The renderer duplicates these helpers because it cannot require CommonJS
  // modules; make sure both copies stay in sync.
  test('mirror the main-process behaviour', () => {
    for (const value of ['10', '10abc', -5, 99, 10.6, '', NaN, undefined, '1e21']) {
      expect(rendererClampInt(value, 0, 30, 5)).toBe(clampInt(value, 0, 30, 5));
    }
    for (const value of ['', '-100', 1000, '1e21', 'abc']) {
      expect(rendererClampDelay(value)).toBe(clampDelay(value));
    }
    for (const value of [10, 0, 5000, 99999999, 'abc', undefined]) {
      expect(rendererClampScriptTimeout(value, 7000)).toBe(clampScriptTimeout(value, 7000));
    }
  });
});
