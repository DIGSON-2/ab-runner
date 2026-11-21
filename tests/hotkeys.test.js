import {
  normalizeKey,
  comboFromEvent,
  formatCombo,
  isEditableTarget,
  findHotkey,
  comboToTabIndex,
  isMacPlatform,
} from '../src/renderer/hotkeys.js';

const event = (overrides = {}) => ({
  key: '',
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...overrides,
});

describe('normalizeKey', () => {
  test('upper-cases letters so Shift does not create a different combo', () => {
    expect(normalizeKey('n')).toBe('N');
    expect(normalizeKey('N')).toBe('N');
  });

  test('keeps named keys and digits', () => {
    expect(normalizeKey('Enter')).toBe('Enter');
    expect(normalizeKey('Tab')).toBe('Tab');
    expect(normalizeKey('F1')).toBe('F1');
    expect(normalizeKey('1')).toBe('1');
    expect(normalizeKey(' ')).toBe('Space');
  });

  test('handles empty input', () => {
    expect(normalizeKey('')).toBe('');
    expect(normalizeKey(undefined)).toBe('');
  });
});

describe('comboFromEvent', () => {
  test('Ctrl+Enter', () => {
    expect(comboFromEvent(event({ key: 'Enter', ctrlKey: true }))).toBe('Mod+Enter');
  });

  test('Cmd+Enter on macOS is the same combo', () => {
    expect(comboFromEvent(event({ key: 'Enter', metaKey: true }))).toBe('Mod+Enter');
  });

  test('Ctrl+Shift+Enter', () => {
    expect(comboFromEvent(event({ key: 'Enter', ctrlKey: true, shiftKey: true }))).toBe(
      'Mod+Shift+Enter',
    );
  });

  test('Ctrl+Shift+Tab and Ctrl+N', () => {
    expect(comboFromEvent(event({ key: 'Tab', ctrlKey: true, shiftKey: true }))).toBe('Mod+Shift+Tab');
    expect(comboFromEvent(event({ key: 'n', ctrlKey: true }))).toBe('Mod+N');
  });

  test('digits and function keys', () => {
    expect(comboFromEvent(event({ key: '3', ctrlKey: true }))).toBe('Mod+3');
    expect(comboFromEvent(event({ key: 'F1' }))).toBe('F1');
  });

  test('Alt is included', () => {
    expect(comboFromEvent(event({ key: 'x', ctrlKey: true, altKey: true }))).toBe('Mod+Alt+X');
  });

  test('empty event', () => {
    expect(comboFromEvent(null)).toBe('');
    expect(comboFromEvent({})).toBe('');
  });
});

describe('formatCombo', () => {
  test('windows/linux labels', () => {
    expect(formatCombo('Mod+Enter')).toBe('Ctrl+Enter');
    expect(formatCombo('Mod+Shift+N')).toBe('Ctrl+Shift+N');
    expect(formatCombo('F1')).toBe('F1');
  });

  test('mac labels', () => {
    expect(formatCombo('Mod+Enter', true)).toBe('⌘Enter');
    expect(formatCombo('Mod+Shift+Tab', true)).toBe('⌘⇧Tab');
  });
});

describe('isEditableTarget', () => {
  const target = (matches) => ({ closest: () => (matches ? {} : null) });

  test('detects inputs, textareas, selects, contenteditable and CodeMirror', () => {
    expect(isEditableTarget(target(true))).toBe(true);
  });

  test('returns false for ordinary elements and missing targets', () => {
    expect(isEditableTarget(target(false))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget({})).toBe(false);
  });
});

describe('findHotkey', () => {
  const hotkeys = [{ combo: 'Mod+Enter' }, { combo: 'Mod+N' }];

  test('finds by exact combo', () => {
    expect(findHotkey(hotkeys, 'Mod+N')).toEqual({ combo: 'Mod+N' });
  });

  test('returns null for unknown combos and bad input', () => {
    expect(findHotkey(hotkeys, 'Mod+Q')).toBeNull();
    expect(findHotkey(null, 'Mod+N')).toBeNull();
    expect(findHotkey(hotkeys, '')).toBeNull();
  });
});

describe('comboToTabIndex', () => {
  test('maps Mod+1…Mod+9 to zero-based indexes', () => {
    expect(comboToTabIndex('Mod+1')).toBe(0);
    expect(comboToTabIndex('Mod+9')).toBe(8);
  });

  test('ignores other combos and unsupported digits', () => {
    expect(comboToTabIndex('Mod+0')).toBeNull();
    expect(comboToTabIndex('Mod+N')).toBeNull();
    expect(comboToTabIndex('Shift+Mod+1')).toBeNull();
    expect(comboToTabIndex('')).toBeNull();
  });
});

describe('isMacPlatform', () => {
  test('detects macOS from platform or user agent', () => {
    expect(isMacPlatform('MacIntel')).toBe(true);
    expect(isMacPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(true);
    expect(isMacPlatform('Win32')).toBe(false);
    expect(isMacPlatform('')).toBe(false);
  });
});
