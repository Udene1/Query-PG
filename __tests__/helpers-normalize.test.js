const helpers = require('../lib/helpers.js');

describe('normalizeParsedResponse', () => {
  test('handles JSON parsed result', () => {
    const parsed = { rawData: { a: 1 }, rawText: '', lastStatus: 200 };
    const n = helpers.normalizeParsedResponse(parsed);
    expect(n.rawData).toEqual({ a: 1 });
    expect(n.rawText).toBe('');
    expect(n.lastStatus).toBe(200);
    expect(n.output).toContain('"a": 1');
  });

  test('handles text parsed result', () => {
    const parsed = { rawData: null, rawText: 'hello', lastStatus: 200 };
    const n = helpers.normalizeParsedResponse(parsed);
    expect(n.rawData).toBeNull();
    expect(n.rawText).toBe('hello');
    expect(n.output).toBe('hello');
  });

  test('propagates error strings in rawText', () => {
    const parsed = { rawData: null, rawText: 'Error: disk full', lastStatus: 200 };
    const n = helpers.normalizeParsedResponse(parsed);
    expect(n.rawData).toBeNull();
    expect(n.rawText).toBe('Error: disk full');
    expect(n.output).toBe('Error: disk full');
  });

  test('handles parsed.error object', () => {
    const parsed = { error: new Error('boom') };
    const n = helpers.normalizeParsedResponse(parsed);
    expect(n.rawData).toBeNull();
    expect(n.rawText).toContain('Error:');
    expect(n.output).toContain('Error:');
  });

  test('handles null parsed', () => {
    const n = helpers.normalizeParsedResponse(null);
    expect(n.rawData).toBeNull();
    expect(n.rawText).toBe('');
    expect(n.lastStatus).toBeNull();
    expect(n.output).toBe('');
  });
});
