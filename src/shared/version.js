// Version comparison for the updater. Supports the subset used by GitHub
// release tags: "1.2.3", "v1.2.3", "1.2.3-beta.1". Prerelease versions sort
// below the corresponding release, like semver.

/**
 * @param {string} value
 * @returns {{major: number, minor: number, patch: number, prerelease: string}|null}
 */
function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+]([0-9A-Za-z.-]+))?$/.exec(String(value == null ? '' : value).trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
  };
}

function comparePrerelease(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1; // release > prerelease
  if (!b) return -1;
  return a === b ? 0 : a < b ? -1 : 1;
}

/**
 * Compares two versions. Returns 1 when `a` is newer, -1 when older, 0 when
 * equal. Invalid versions are considered older than valid ones.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;

  if (left.major !== right.major) return left.major > right.major ? 1 : -1;
  if (left.minor !== right.minor) return left.minor > right.minor ? 1 : -1;
  if (left.patch !== right.patch) return left.patch > right.patch ? 1 : -1;
  return comparePrerelease(left.prerelease, right.prerelease);
}

/**
 * @param {string} candidate - version from the release feed
 * @param {string} current - installed version
 * @returns {boolean}
 */
function isNewerVersion(candidate, current) {
  return compareVersions(candidate, current) > 0;
}

module.exports = { parseVersion, compareVersions, isNewerVersion };
