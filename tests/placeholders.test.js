const { replacePlaceholders } = require('../src/shared/placeholders');

describe('replacePlaceholders', () => {
  test('returns falsy templates unchanged', () => {
    expect(replacePlaceholders('', {})).toBe('');
    expect(replacePlaceholders(null, {})).toBe(null);
  });

  test('substitutes top-level fields', () => {
    expect(replacePlaceholders('/users/{id}', { id: 7 })).toBe('/users/7');
  });

  test('substitutes nested fields via dot notation', () => {
    expect(replacePlaceholders('{user.email}', { user: { email: 'a@b.c' } })).toBe('a@b.c');
  });

  test('falls back to environment variables', () => {
    expect(replacePlaceholders('{baseUrl}/x', { id: 1 }, { baseUrl: 'https://api' })).toBe('https://api/x');
  });

  test('leaves unknown placeholders untouched', () => {
    expect(replacePlaceholders('{missing}', { id: 1 })).toBe('{missing}');
  });

  test('treats primitive item as {id}', () => {
    expect(replacePlaceholders('/users/{id}', 42)).toBe('/users/42');
  });

  test('null values become empty string', () => {
    expect(replacePlaceholders('{a}', { a: null })).toBe('');
  });

  test('object values stay as-is unless toJson is set', () => {
    const item = { obj: { x: 1 } };
    expect(replacePlaceholders('{obj}', item)).toBe('{obj}');
    expect(replacePlaceholders('{obj}', item, {}, { toJson: true })).toBe('{"x":1}');
  });
});
