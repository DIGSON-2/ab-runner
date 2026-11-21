import { touchTab, closeTab, closeUnpinned, setPinned, pruneTabs, moveTab } from '../src/renderer/tabs.js';

const makeTabs = (...ids) => ids.map((id) => ({ id, pinned: false, lastOpenedAt: 1 }));

describe('tabs module', () => {
  test('touchTab adds a new tab', () => {
    const tabs = touchTab([], 'c1', { now: 100 });
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({ id: 'c1', pinned: false, lastOpenedAt: 100 });
  });

  test('touchTab refreshes lastOpenedAt without duplicating', () => {
    let tabs = touchTab([], 'c1', { now: 100 });
    tabs = touchTab(tabs, 'c1', { now: 200 });
    expect(tabs).toHaveLength(1);
    expect(tabs[0].lastOpenedAt).toBe(200);
  });

  test('touchTab ignores empty id', () => {
    expect(touchTab([], '')).toEqual([]);
  });

  test('touchTab evicts oldest unpinned beyond maxUnpinned', () => {
    let tabs = [];
    for (let i = 1; i <= 3; i++) {
      tabs = touchTab(tabs, `c${i}`, { now: i, maxUnpinned: 2 });
    }
    // c1 (oldest) should have been evicted, c2 and c3 remain.
    expect(tabs.map((t) => t.id).sort()).toEqual(['c2', 'c3']);
  });

  test('touchTab never evicts pinned tabs', () => {
    let tabs = touchTab([], 'p1', { now: 1, maxUnpinned: 1 });
    tabs = setPinned(tabs, 'p1', true);
    tabs = touchTab(tabs, 'c2', { now: 2, maxUnpinned: 1 });
    tabs = touchTab(tabs, 'c3', { now: 3, maxUnpinned: 1 });
    expect(tabs.find((t) => t.id === 'p1')).toBeTruthy();
    // Only one unpinned slot: c3 (newest) stays, c2 evicted.
    expect(tabs.filter((t) => !t.pinned).map((t) => t.id)).toEqual(['c3']);
  });

  test('closeTab removes only the given tab', () => {
    const tabs = [
      { id: 'c1', pinned: false, lastOpenedAt: 1 },
      { id: 'c2', pinned: false, lastOpenedAt: 2 },
    ];
    expect(closeTab(tabs, 'c1').map((t) => t.id)).toEqual(['c2']);
  });

  test('closeUnpinned keeps only pinned tabs', () => {
    const tabs = [
      { id: 'c1', pinned: true, lastOpenedAt: 1 },
      { id: 'c2', pinned: false, lastOpenedAt: 2 },
    ];
    expect(closeUnpinned(tabs).map((t) => t.id)).toEqual(['c1']);
  });

  test('setPinned toggles pinned state immutably', () => {
    const tabs = [{ id: 'c1', pinned: false, lastOpenedAt: 1 }];
    const next = setPinned(tabs, 'c1', true);
    expect(next[0].pinned).toBe(true);
    expect(tabs[0].pinned).toBe(false);
  });

  test('pruneTabs drops tabs whose collection no longer exists', () => {
    const tabs = [
      { id: 'c1', pinned: false, lastOpenedAt: 1 },
      { id: 'gone', pinned: false, lastOpenedAt: 2 },
    ];
    const alive = new Set(['c1']);
    expect(pruneTabs(tabs, (id) => alive.has(id)).map((t) => t.id)).toEqual(['c1']);
  });

  test('moveTab moves a tab forward (drag to the right)', () => {
    const tabs = makeTabs('a', 'b', 'c');
    // Drag "a" and drop it after "b".
    expect(moveTab(tabs, 'a', 'b', false).map((t) => t.id)).toEqual(['b', 'a', 'c']);
  });

  test('moveTab moves a tab backward (drag to the left)', () => {
    const tabs = makeTabs('a', 'b', 'c');
    // Drag "c" and drop it before "a".
    expect(moveTab(tabs, 'c', 'a', true).map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });

  test('moveTab inserts before/after the target', () => {
    const tabs = makeTabs('a', 'b', 'c');
    expect(moveTab(tabs, 'c', 'b', true).map((t) => t.id)).toEqual(['a', 'c', 'b']);
    expect(moveTab(tabs, 'c', 'b', false).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  test('moveTab moves a tab to the end when target is empty', () => {
    const tabs = makeTabs('a', 'b', 'c');
    expect(moveTab(tabs, 'a', null).map((t) => t.id)).toEqual(['b', 'c', 'a']);
    expect(moveTab(tabs, 'a', '').map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  test('moveTab returns the same array for no-op moves', () => {
    const tabs = makeTabs('a', 'b', 'c');
    expect(moveTab(tabs, 'b', 'b')).toBe(tabs);
    expect(moveTab(tabs, 'missing', 'a')).toBe(tabs);
    expect(moveTab(tabs, 'a', 'missing')).toBe(tabs);
    expect(moveTab(tabs, '', 'a')).toBe(tabs);
    // Already at the end and dropped at the end.
    expect(moveTab(tabs, 'c', null)).toBe(tabs);
  });

  test('moveTab does not mutate the input array', () => {
    const tabs = makeTabs('a', 'b', 'c');
    const next = moveTab(tabs, 'a', 'c', false);
    expect(tabs.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(next.map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });
});
