// Pure logic for the "open requests" tab strip (Postman-like).
// A tab references a step (request) by its stable id plus the collection it
// lives in. All functions are pure and return a new array so they can be unit
// tested without a DOM.

/**
 * @typedef {Object} OpenTab
 * @property {string} stepId
 * @property {string} collectionId
 * @property {boolean} pinned
 * @property {number} lastOpenedAt
 */

export const DEFAULT_MAX_UNPINNED = 12;

function countUnpinned(tabs) {
  return tabs.reduce((n, t) => (t.pinned ? n : n + 1), 0);
}

/**
 * Add a tab for a step, or refresh its `lastOpenedAt` if it already exists.
 * Unpinned tabs beyond `maxUnpinned` are evicted oldest-first (the tab just
 * touched is always kept).
 * @param {OpenTab[]} tabs
 * @param {{stepId: string, collectionId: string}} ref
 * @param {{now?: number, maxUnpinned?: number}} [opts]
 * @returns {OpenTab[]}
 */
export function touchTab(tabs, ref, opts = {}) {
  const now = opts.now ?? Date.now();
  const maxUnpinned = opts.maxUnpinned ?? DEFAULT_MAX_UNPINNED;
  const { stepId, collectionId } = ref;
  if (!stepId) return tabs;

  let next;
  const existing = tabs.find((t) => t.stepId === stepId);
  if (existing) {
    next = tabs.map((t) => (t.stepId === stepId ? { ...t, collectionId, lastOpenedAt: now } : t));
  } else {
    next = [...tabs, { stepId, collectionId, pinned: false, lastOpenedAt: now }];
  }

  // Evict oldest unpinned tabs (never the one we just touched).
  while (countUnpinned(next) > maxUnpinned) {
    const victim = next
      .filter((t) => !t.pinned && t.stepId !== stepId)
      .sort((a, b) => a.lastOpenedAt - b.lastOpenedAt)[0];
    if (!victim) break;
    next = next.filter((t) => t.stepId !== victim.stepId);
  }
  return next;
}

/**
 * @param {OpenTab[]} tabs
 * @param {string} stepId
 * @returns {OpenTab[]}
 */
export function closeTab(tabs, stepId) {
  return tabs.filter((t) => t.stepId !== stepId);
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
 * @param {string} stepId
 * @param {boolean} pinned
 * @returns {OpenTab[]}
 */
export function setPinned(tabs, stepId, pinned) {
  return tabs.map((t) => (t.stepId === stepId ? { ...t, pinned } : t));
}

/**
 * Drop tabs whose step or collection no longer exists.
 * @param {OpenTab[]} tabs
 * @param {(ref: {stepId: string, collectionId: string}) => boolean} exists
 * @returns {OpenTab[]}
 */
export function pruneTabs(tabs, exists) {
  return tabs.filter((t) => exists({ stepId: t.stepId, collectionId: t.collectionId }));
}
