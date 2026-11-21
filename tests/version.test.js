const { parseVersion, compareVersions, isNewerVersion } = require('../src/shared/version');

describe('parseVersion', () => {
  test('parses plain, v-prefixed and prerelease versions', () => {
    expect(parseVersion('1.2.3')).toMatchObject({ major: 1, minor: 2, patch: 3, prerelease: '' });
    expect(parseVersion('v1.1.18')).toMatchObject({ major: 1, minor: 1, patch: 18 });
    expect(parseVersion(' 2.0.0-beta.1 ')).toMatchObject({ major: 2, minor: 0, patch: 0, prerelease: 'beta.1' });
  });

  test('rejects garbage', () => {
    expect(parseVersion('latest')).toBeNull();
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('')).toBeNull();
    expect(parseVersion(null)).toBeNull();
  });
});

describe('compareVersions', () => {
  test('detects newer and older releases', () => {
    expect(compareVersions('1.1.19', '1.1.18')).toBe(1);
    expect(compareVersions('1.1.18', '1.1.19')).toBe(-1);
    expect(compareVersions('1.1.18', '1.1.18')).toBe(0);
    expect(compareVersions('v1.1.18', '1.1.18')).toBe(0);
  });

  test('compares each numeric part, not as strings', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
    expect(compareVersions('1.1.100', '1.1.99')).toBe(1);
  });

  test('release sorts above its prerelease', () => {
    expect(compareVersions('1.2.0', '1.2.0-beta.1')).toBe(1);
    expect(compareVersions('1.2.0-beta.1', '1.2.0')).toBe(-1);
    expect(compareVersions('1.2.0-alpha', '1.2.0-beta')).toBe(-1);
  });

  test('invalid versions are treated as older', () => {
    expect(compareVersions('not-a-version', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', 'not-a-version')).toBe(1);
    expect(compareVersions('bad', 'worse')).toBe(0);
  });
});

describe('isNewerVersion', () => {
  test('is true only for newer releases', () => {
    expect(isNewerVersion('1.1.19', '1.1.18')).toBe(true);
    expect(isNewerVersion('1.1.18', '1.1.18')).toBe(false);
    expect(isNewerVersion('1.1.17', '1.1.18')).toBe(false);
    expect(isNewerVersion('v1.2.0', '1.1.18')).toBe(true);
  });
});
