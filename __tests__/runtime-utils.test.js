const utils = require('../lib/runtime-utils.js');

describe('runtime-utils.minimalBuild', () => {
  test('builds URL when server ends with slash and endpoint starts with slash', () => {
    const apiSpec = { servers: [{ url: 'http://api/' }] };
    const built = utils.minimalBuild(apiSpec, '/x', 'GET', {}, '', 'none', '', null);
    expect(built.url).toBe('http://api/x');
    expect(built.options.method).toBe('GET');
  });

  test('uses helpers.parseRequestBody and buildHeaders when provided', () => {
    const apiSpec = { servers: [{ url: 'http://api' }] };
    const fakeHelpers = {
      parseRequestBody: (s) => ({ ok: true, body: { foo: s } }),
      buildHeaders: (auth, token) => ({ Authorization: token || 'no' })
    };
    const built = utils.minimalBuild(apiSpec, '/p', 'POST', {}, 'abc', 'bearer', 'tok', fakeHelpers);
    expect(built.options.headers.Authorization).toBe('tok');
    expect(built.options.body).toBe(JSON.stringify({ foo: 'abc' }));
  });
});

describe('runtime-utils.fallbackParseResponse', () => {
  test('parses JSON responses and stores them', async () => {
    const storage = (() => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; }, _m: m }; })();
    const resp = { status: 200, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) };
    const parsed = await utils.fallbackParseResponse(storage, '/a', 'http://api/a', 'GET', resp);
    expect(parsed.rawData).toEqual({ ok: true });
    expect(storage.getItem('queryplay:/a:GET')).toBeDefined();
  });

  test('parses text responses and truncates long text and stores', async () => {
    const storage = (() => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; }, _m: m }; })();
    const longText = 'a'.repeat(20000);
    const resp = { status: 200, headers: { get: () => 'text/plain' }, text: async () => longText };
    const parsed = await utils.fallbackParseResponse(storage, '/t', 'http://api/t', 'POST', resp);
    expect(parsed.rawText).toContain('...truncated...');
    expect(storage.getItem('queryplay:/t:POST')).toBeDefined();
  });

  test('storage.setItem throwing bubbles to caller', async () => {
    const storage = { setItem: () => { throw new Error('disk full'); }, getItem: () => null };
    const resp = { status: 200, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) };
    await expect(utils.fallbackParseResponse(storage, '/s', 'http://api/s', 'GET', resp)).rejects.toThrow('disk full');
  });
});
