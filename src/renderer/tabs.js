// Pure logic for the "open requests" tab strip (Postman-like).
// A tab references a collection by its stable id. All functions are pure and
// return a new array so they can be unit tested without a DOM.

/**
 * @typedef {Object} OpenTab
 * @property {string} id - collection id
 * @property {boolean} pinned
 * @property {number} lastOpenedAt
 */

export const DEFAULT_MAX_UNPINNED = 12;

function countUnpinned(tabs) {
  return tabs.reduce((n, t) => (t.pinned ? n : n + 1), 0);
}

/**
 * Add a tab for a collection, or refresh its `lastOpenedAt` if it already
 * exists. Unpinned tabs beyond `maxUnpinned` are evicted oldest-first (the tab
 * just touched is always kept).
 * @param {OpenTab[]} tabs
 * @param {string} id - collection id
 * @param {{now?: number, maxUnpinned?: number}} [opts]
 * @returns {OpenTab[]}
 */
export function touchTab(tabs, id, opts = {}) {
  const now = opts.now ?? Date.now();
  const maxUnpinned = opts.maxUnpinned ?? DEFAULT_MAX_UNPINNED;
  if (!id) return tabs;

  let next;
  const existing = tabs.find((t) => t.id === id);
  if (existing) {
    next = tabs.map((t) => (t.id === id ? { ...t, lastOpenedAt: now } : t));
  } else {
    next = [...tabs, { id, pinned: false, lastOpenedAt: now }];
  }

  // Evict oldest unpinned tabs (never the one we just touched).
  while (countUnpinned(next) > maxUnpinned) {
    const victim = next.filter((t) => !t.pinned && t.id !== id).sort((a, b) => a.lastOpenedAt - b.lastOpenedAt)[0];
    if (!victim) break;
    next = next.filter((t) => t.id !== victim.id);
  }
  return next;
}

/**
 * @param {OpenTab[]} tabs
 * @param {string} id
 * @returns {OpenTab[]}
 */
export function closeTab(tabs, id) {
  return tabs.filter((t) => t.id !== id);
}

/**
 * Remove every unpinned tab.
 * @param {OpenTab[]} tabs
 * @returns {OpenTab[]}
 */
export function closeUnpinned(tabs) {
  return tabs.filter((t) => t.pinned);
}

/**
 * @param {OpenTab[]} tabs
 * @param {string} id
 * @param {boolean} pinned
 * @returns {OpenTab[]}
 */
export function setPinned(tabs, id, pinned) {
  return tabs.map((t) => (t.id === id ? { ...t, pinned } : t));
}

/**
 * Drop tabs whose collection no longer exists.
 * @param {OpenTab[]} tabs
 * @param {(id: string) => boolean} exists
 * @returns {OpenTab[]}
 */
export function pruneTabs(tabs, exists) {
  return tabs.filter((t) => exists(t.id));
}
