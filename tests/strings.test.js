const { cleanString, stripJsonComments, repairJsonText } = require('../src/shared/strings');

describe('cleanString', () => {
  test('returns non-strings unchanged', () => {
    expect(cleanString(42)).toBe(42);
    expect(cleanString(null)).toBe(null);
  });

  test('strips BOM and zero-width characters', () => {
    expect(cleanString('\uFEFFhello\u200B')).toBe('hello');
  });

  test('strips control characters', () => {
    expect(cleanString('a\u0000b\u001Fc')).toBe('abc');
  });

  test('leaves clean text intact', () => {
    expect(cleanString('https://api.example.com/{id}')).toBe('https://api.example.com/{id}');
  });
});

describe('stripJsonComments', () => {
  test('removes line comments', () => {
    expect(stripJsonComments('{"a":1} // trailing')).toBe('{"a":1} ');
  });

  test('removes block comments', () => {
    expect(stripJsonComments('{"a":/* note */1}')).toBe('{"a":1}');
  });

  test('keeps comment-like sequences inside strings', () => {
    const input = '{"url":"http://x//y","note":"/* not a comment */"}';
    expect(stripJsonComments(input)).toBe(input);
  });

  test('handles escaped quotes inside strings', () => {
    const input = '{"a":"he said \\"hi\\" // x"}';
    expect(stripJsonComments(input)).toBe(input);
  });

  test('removes single-slash line comments at line start', () => {
    expect(stripJsonComments('{\n/type: support\n"a":1\n}')).toBe('{\n\n"a":1\n}');
  });
});

describe('repairJsonText', () => {
  test('repairs comments and missing closing brackets', () => {
    expect(JSON.parse(repairJsonText('{"a":[1,2]\n/type: support'))).toEqual({ a: [1, 2] });
  });

  test('throws readable syntax details for invalid json', () => {
    expect(() => repairJsonText('{"a": }')).toThrow(/line|position/i);
  });
});
