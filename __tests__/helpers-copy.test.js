const helpers = require('../lib/helpers.js');

describe('buildCopyText', () => {
  test('includes status and json when rawData present', () => {
    const txt = helpers.buildCopyText({ a: 1 }, '', 200);
    expect(txt).toContain('Status: 200');
    expect(txt).toContain('"a": 1');
  });

  test('includes rawText when rawData is null', () => {
    const txt = helpers.buildCopyText(null, 'plain text', 500);
    expect(txt).toContain('Status: 500');
    expect(txt).toContain('plain text');
  });

  test('empty when no inputs', () => {
    const txt = helpers.buildCopyText(null, '', null);
    expect(txt).toBe('');
  });
});
