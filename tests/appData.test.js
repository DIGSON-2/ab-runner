const {
  emptyAppData,
  normalizeAppData,
  prepareDataForDisk,
  cleanExpiredRecentCollections,
} = require('../src/shared/appData');

describe('normalizeAppData', () => {
  test('returns empty defaults for a non-object payload', () => {
    expect(normalizeAppData(null)).toEqual(emptyAppData());
    expect(normalizeAppData('nope')).toEqual(emptyAppData());
    expect(normalizeAppData([])).toEqual(emptyAppData());
  });

  test('replaces invalid containers with arrays', () => {
    const data = normalizeAppData({
      folders: {},
      collections: 'x',
      environments: null,
      platforms: 5,
      scriptPresets: false,
      openTabs: 0,
      recentCollections: {},
    });
    expect(data.folders).toEqual([]);
    expect(data.collections).toEqual([]);
    expect(data.environments).toEqual([]);
    expect(data.platforms).toEqual([]);
    expect(data.scriptPresets).toEqual([]);
    expect(data.openTabs).toEqual([]);
    expect(data.recentCollections).toEqual([]);
    expect(data.activeCollectionId).toBe('');
  });

  test('drops non-object entries instead of crashing later', () => {
    const data = normalizeAppData({
      folders: [{ id: 'f1' }, null, 'bad'],
      collections: [{ id: 'c1', steps: [{ id: 's1' }, null] }, 42],
      environments: [{ id: 'e1' }, 'bad'],
    });
    expect(data.folders).toHaveLength(1);
    expect(data.collections).toHaveLength(1);
    expect(data.collections[0].steps).toHaveLength(1);
    expect(data.environments).toHaveLength(1);
  });

  test('adds default scripts to legacy steps', () => {
    const data = normalizeAppData({ collections: [{ id: 'c1', steps: [{ id: 's1' }] }] });
    const scripts = data.collections[0].steps[0].scripts;
    expect(scripts.prerequest).toEqual({ enabled: false, code: '', timeout: 5000 });
    expect(scripts.postresponse).toEqual({ enabled: false, code: '', timeout: 5000 });
  });

  test('keeps existing scripts untouched', () => {
    const scripts = { prerequest: { code: 'pm.log(1)', timeout: 1000 } };
    const data = normalizeAppData({ collections: [{ steps: [{ scripts }] }] });
    expect(data.collections[0].steps[0].scripts).toBe(scripts);
  });

  test('removes stale recent collections', () => {
    const now = Date.now();
    const data = normalizeAppData(
      {
        recentCollections: [
          { collectionId: 'a', timestamp: now - 1000 },
          { collectionId: 'b', timestamp: now - 40 * 24 * 60 * 60 * 1000 },
          { collectionId: 'c' },
        ],
      },
      { now },
    );
    expect(data.recentCollections.map((r) => r.collectionId)).toEqual(['a']);
  });
});

describe('cleanExpiredRecentCollections', () => {
  test('filters by age and ignores broken entries', () => {
    const now = 1_000_000_000;
    const data = cleanExpiredRecentCollections(
      {
        recentCollections: [
          { collectionId: 'fresh', timestamp: now - 1 },
          { collectionId: 'old', timestamp: now - 31 * 24 * 60 * 60 * 1000 },
          null,
          'bad',
        ],
      },
      now,
    );
    expect(data.recentCollections).toHaveLength(1);
    expect(data.recentCollections[0].collectionId).toBe('fresh');
  });
});

describe('prepareDataForDisk', () => {
  test('drops run results and internal fields', () => {
    const data = {
      collections: [
        { id: 'c1', results: [{ status: 200 }], steps: [] },
        { id: 'c2', steps: [] },
      ],
      folders: [],
      __loadFailed: true,
      __allowEmpty: true,
    };
    const stored = prepareDataForDisk(data);
    expect(stored.__loadFailed).toBeUndefined();
    expect(stored.__allowEmpty).toBeUndefined();
    expect(stored.collections[0].results).toBeUndefined();
    expect(stored.collections[1]).toEqual({ id: 'c2', steps: [] });
  });

  test('does not mutate the live data object', () => {
    const data = { collections: [{ id: 'c1', results: [{ status: 200 }] }] };
    prepareDataForDisk(data);
    expect(data.collections[0].results).toHaveLength(1);
  });

  test('drops empty results arrays as well', () => {
    const stored = prepareDataForDisk({ collections: [{ id: 'c1', results: [] }] });
    expect(stored.collections[0]).toEqual({ id: 'c1' });
  });

  test('uses main-process recent collections when provided', () => {
    const stored = prepareDataForDisk(
      { collections: [], recentCollections: [{ collectionId: 'stale' }] },
      { recentCollections: [{ collectionId: 'fresh' }] },
    );
    expect(stored.recentCollections).toEqual([{ collectionId: 'fresh' }]);
  });

  test('keeps payload recent collections when no override is given', () => {
    const stored = prepareDataForDisk({ recentCollections: [{ collectionId: 'from-backup' }] });
    expect(stored.recentCollections).toEqual([{ collectionId: 'from-backup' }]);
  });

  test('always writes arrays for known keys', () => {
    const stored = prepareDataForDisk({ folders: null, collections: undefined });
    expect(stored.folders).toEqual([]);
    expect(stored.collections).toEqual([]);
    expect(stored.environments).toEqual([]);
    expect(stored.openTabs).toEqual([]);
  });
});
