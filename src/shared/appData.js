// Shape helpers for the on-disk application data file (ab-runner-data.json).
// Pure functions: no fs, no Electron, so they can be unit tested directly.

const DATA_KEYS = [
  'folders',
  'collections',
  'environments',
  'platforms',
  'scriptPresets',
  'openTabs',
  'recentCollections',
];

const RECENT_COLLECTIONS_LIMIT = 20;
const RECENT_COLLECTIONS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function emptyAppData() {
  return {
    folders: [],
    collections: [],
    environments: [],
    platforms: [],
    scriptPresets: [],
    activePlatformId: '',
    activeCollectionId: '',
    openTabs: [],
    recentCollections: [],
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanExpiredRecentCollections(data, now = Date.now()) {
  if (!Array.isArray(data.recentCollections)) return data;
  data.recentCollections = data.recentCollections.filter(
    (entry) => isPlainObject(entry) && Number(entry.timestamp) > now - RECENT_COLLECTIONS_MAX_AGE_MS,
  );
  return data;
}

/**
 * Brings data read from disk (or from a backup file) to a predictable shape so a
 * damaged file cannot crash the app, e.g. `"collections": {}` instead of an array.
 * Mutates and returns the given object.
 * @param {*} parsed
 * @param {{now?: number}} [options]
 */
function normalizeAppData(parsed, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const data = isPlainObject(parsed) ? parsed : emptyAppData();

  DATA_KEYS.forEach((key) => {
    if (!Array.isArray(data[key])) data[key] = [];
  });
  if (!data.activePlatformId) data.activePlatformId = '';
  if (!data.activeCollectionId) data.activeCollectionId = '';

  data.folders = data.folders.filter(isPlainObject);
  data.collections = data.collections.filter(isPlainObject);
  data.environments = data.environments.filter(isPlainObject);
  // Script presets are handled by the renderer, but keep the array sane here.
  data.scriptPresets = data.scriptPresets.filter(isPlainObject);
  data.openTabs = data.openTabs.filter(isPlainObject);
  cleanExpiredRecentCollections(data, now);

  // Initialize scripts field for all steps (backward compatibility).
  data.collections.forEach((collection) => {
    if (!Array.isArray(collection.steps)) collection.steps = [];
    collection.steps = collection.steps.filter(isPlainObject);
    collection.steps.forEach((step) => {
      if (!step.scripts) {
        step.scripts = {
          prerequest: { enabled: false, code: '', timeout: 5000 },
          postresponse: { enabled: false, code: '', timeout: 5000 },
        };
      }
    });
  });

  return data;
}

/**
 * Data that is worth writing to disk: internal `__` fields and the results of
 * the last run are dropped (results are never shown after a restart but used to
 * take more than half of the data file).
 * @param {*} data
 * @param {{recentCollections?: Array}} [options] main-process authoritative list
 */
function prepareDataForDisk(data, options = {}) {
  const source = isPlainObject(data) ? data : {};
  const out = {};
  Object.keys(source).forEach((key) => {
    if (key.startsWith('__')) return;
    out[key] = source[key];
  });

  DATA_KEYS.forEach((key) => {
    if (!Array.isArray(out[key])) out[key] = [];
  });

  out.collections = out.collections.map((collection) => {
    if (!isPlainObject(collection)) return collection;
    // Results of the last run are never shown after a restart; even empty
    // `results: []` arrays are dropped so the file does not accumulate them.
    if (!Array.isArray(collection.results)) return collection;
    const copy = { ...collection };
    delete copy.results;
    return copy;
  });

  if (Array.isArray(options.recentCollections)) {
    out.recentCollections = options.recentCollections;
  }

  return out;
}

module.exports = {
  DATA_KEYS,
  RECENT_COLLECTIONS_LIMIT,
  RECENT_COLLECTIONS_MAX_AGE_MS,
  emptyAppData,
  cleanExpiredRecentCollections,
  normalizeAppData,
  prepareDataForDisk,
};
