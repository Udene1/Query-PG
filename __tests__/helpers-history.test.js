const helpers = require('../lib/helpers.js');

describe('parseHistoryEntry', () => {
  test('parses JSON string into rawData', () => {
    const entry = { output: JSON.stringify({ a: 1 }) };
    const p = helpers.parseHistoryEntry(entry);
    expect(p.rawData).toEqual({ a: 1 });
    expect(p.rawText).toBe('');
  });

  test('returns rawText when output is plain string', () => {
    const entry = { output: 'plain text' };
    const p = helpers.parseHistoryEntry(entry);
    expect(p.rawData).toBeNull();
    expect(p.rawText).toBe('plain text');
  });

  test('returns object when output is object', () => {
    const entry = { output: { x: 2 } };
    const p = helpers.parseHistoryEntry(entry);
    expect(p.rawData).toEqual({ x: 2 });
    expect(p.rawText).toBe('');
  });
});
