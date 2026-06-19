import { touchTab, closeTab, closeUnpinned, setPinned, pruneTabs } from '../src/renderer/tabs.js';

describe('tabs module', () => {
  test('touchTab adds a new tab', () => {
    const tabs = touchTab([], { stepId: 's1', collectionId: 'c1' }, { now: 100 });
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({ stepId: 's1', collectionId: 'c1', pinned: false, lastOpenedAt: 100 });
  });

  test('touchTab refreshes lastOpenedAt without duplicating', () => {
    let tabs = touchTab([], { stepId: 's1', collectionId: 'c1' }, { now: 100 });
    tabs = touchTab(tabs, { stepId: 's1', collectionId: 'c1' }, { now: 200 });
    expect(tabs).toHaveLength(1);
    expect(tabs[0].lastOpenedAt).toBe(200);
  });

  test('touchTab ignores empty stepId', () => {
    expect(touchTab([], { stepId: '', collectionId: 'c1' })).toEqual([]);
  });

  test('touchTab evicts oldest unpinned beyond maxUnpinned', () => {
    let tabs = [];
    for (let i = 1; i <= 3; i++) {
      tabs = touchTab(tabs, { stepId: `s${i}`, collectionId: 'c1' }, { now: i, maxUnpinned: 2 });
    }
    // s1 (oldest) should have been evicted, s2 and s3 remain.
    expect(tabs.map((t) => t.stepId).sort()).toEqual(['s2', 's3']);
  });

  test('touchTab never evicts pinned tabs', () => {
    let tabs = touchTab([], { stepId: 'p1', collectionId: 'c1' }, { now: 1, maxUnpinned: 1 });
    tabs = setPinned(tabs, 'p1', true);
    tabs = touchTab(tabs, { stepId: 's2', collectionId: 'c1' }, { now: 2, maxUnpinned: 1 });
    tabs = touchTab(tabs, { stepId: 's3', collectionId: 'c1' }, { now: 3, maxUnpinned: 1 });
    expect(tabs.find((t) => t.stepId === 'p1')).toBeTruthy();
    // Only one unpinned slot: s3 (newest) stays, s2 evicted.
    expect(tabs.filter((t) => !t.pinned).map((t) => t.stepId)).toEqual(['s3']);
  });

  test('closeTab removes only the given tab', () => {
    const tabs = [
      { stepId: 's1', collectionId: 'c1', pinned: false, lastOpenedAt: 1 },
      { stepId: 's2', collectionId: 'c1', pinned: false, lastOpenedAt: 2 },
    ];
    expect(closeTab(tabs, 's1').map((t) => t.stepId)).toEqual(['s2']);
  });

  test('closeUnpinned keeps only pinned tabs', () => {
    const tabs = [
      { stepId: 's1', collectionId: 'c1', pinned: true, lastOpenedAt: 1 },
      { stepId: 's2', collectionId: 'c1', pinned: false, lastOpenedAt: 2 },
    ];
    expect(closeUnpinned(tabs).map((t) => t.stepId)).toEqual(['s1']);
  });

  test('setPinned toggles pinned state immutably', () => {
    const tabs = [{ stepId: 's1', collectionId: 'c1', pinned: false, lastOpenedAt: 1 }];
    const next = setPinned(tabs, 's1', true);
    expect(next[0].pinned).toBe(true);
    expect(tabs[0].pinned).toBe(false);
  });

  test('pruneTabs drops tabs whose step no longer exists', () => {
    const tabs = [
      { stepId: 's1', collectionId: 'c1', pinned: false, lastOpenedAt: 1 },
      { stepId: 'gone', collectionId: 'c1', pinned: false, lastOpenedAt: 2 },
    ];
    const alive = new Set(['s1']);
    expect(pruneTabs(tabs, ({ stepId }) => alive.has(stepId)).map((t) => t.stepId)).toEqual(['s1']);
  });
});
