// Pure helpers for keyboard shortcuts. No DOM access, so they can be unit
// tested without a browser.

/**
 * Canonical representation of a pressed key inside a combo.
 * Letters are upper-cased so `n` and `N` (Shift) produce the same combo.
 * @param {string} key - KeyboardEvent.key
 * @returns {string}
 */
export function normalizeKey(key) {
  if (!key) return '';
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/**
 * Builds a combo string from a keyboard event, e.g. "Mod+Shift+Enter".
 * `Mod` means Ctrl on Windows/Linux and Cmd on macOS.
 * @param {KeyboardEvent|{key?: string, ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean, altKey?: boolean}} event
 * @returns {string}
 */
export function comboFromEvent(event) {
  if (!event || !event.key) return '';
  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push('Mod');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(normalizeKey(event.key));
  return parts.join('+');
}

/**
 * Human readable combo, e.g. "Ctrl+Enter" or "⌘+Enter".
 * @param {string} combo
 * @param {boolean} [isMac]
 * @returns {string}
 */
export function formatCombo(combo, isMac = false) {
  if (!combo) return '';
  return combo
    .split('+')
    .map((part) => {
      if (part === 'Mod') return isMac ? '⌘' : 'Ctrl';
      if (part === 'Shift') return isMac ? '⇧' : 'Shift';
      if (part === 'Alt') return isMac ? '⌥' : 'Alt';
      return part;
    })
    .join(isMac ? '' : '+');
}

/**
 * Whether the event target is a text field (typing there must not trigger
 * single-key shortcuts).
 * @param {*} target
 * @returns {boolean}
 */
export function isEditableTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], .CodeMirror'));
}

/**
 * Finds a hotkey definition by combo.
 * @param {Array<{combo: string}>} hotkeys
 * @param {string} combo
 * @returns {Object|null}
 */
export function findHotkey(hotkeys, combo) {
  if (!Array.isArray(hotkeys) || !combo) return null;
  return hotkeys.find((hotkey) => hotkey.combo === combo) || null;
}

/**
 * Parses "Mod+1"…"Mod+9" (tab switching) into a zero-based tab index.
 * @param {string} combo
 * @returns {number|null}
 */
export function comboToTabIndex(combo) {
  const match = /^Mod\+([1-9])$/.exec(String(combo || ''));
  if (!match) return null;
  return Number(match[1]) - 1;
}

/**
 * Detects macOS for display purposes.
 * @param {string} [platform] - navigator.platform / userAgent
 * @returns {boolean}
 */
export function isMacPlatform(platform = '') {
  return /mac/i.test(platform);
}
