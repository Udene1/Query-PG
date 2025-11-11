const { fetchParseAndCache, buildCacheKeys } = require('../lib/helpers');

describe('fetchParseAndCache', () => {
  test('parses JSON responses and saves to storage', async () => {
    const storage = { _store: {}, setItem(k,v){ this._store[k]=String(v) }, getItem(k){ return this._store[k] ?? null } };
    const endpoint = '/p';
    const url = 'https://api/p';
    const method = 'GET';
    const fakeResp = { status: 200, headers: { get: () => 'application/json' }, json: async () => ({ ok: true, val: 1 }) };
    const fetchFn = jest.fn().mockResolvedValue(fakeResp);
    const res = await fetchParseAndCache(storage, endpoint, url, method, fetchFn, {});
    expect(res.rawData).toEqual({ ok: true, val: 1 });
    expect(res.rawText).toBe('');
    const keys = buildCacheKeys(endpoint, url, method);
    expect(storage.getItem(keys[0])).toBeDefined();
  });

  test('truncates long text responses and saves', async () => {
    const storage = { _store: {}, setItem(k,v){ this._store[k]=String(v) }, getItem(k){ return this._store[k] ?? null } };
    const long = 'x'.repeat(15000);
    const fakeResp = { status: 200, headers: { get: () => 'text/plain' }, text: async () => long };
    const fetchFn = jest.fn().mockResolvedValue(fakeResp);
    const res = await fetchParseAndCache(storage, '/p', 'u', 'GET', fetchFn, {});
    expect(res.rawData).toBeNull();
    expect(res.rawText.endsWith('...truncated...')).toBeTruthy();
    const keys = buildCacheKeys('/p', 'u', 'GET');
    expect(storage.getItem(keys[0])).toBeDefined();
  });

  test('parse failure returns error-text', async () => {
    const storage = { _store: {}, setItem(k,v){ this._store[k]=String(v) } };
    const badJsonResp = { status: 200, headers: { get: () => 'application/json' }, json: async () => { throw new Error('bad json'); } };
    const fetchFn = jest.fn().mockResolvedValue(badJsonResp);
    const res = await fetchParseAndCache(storage, '/p', 'u', 'GET', fetchFn, {});
    expect(res.rawData).toBeNull();
    expect(res.rawText).toContain('Error:');
  });

  test('storage.setItem throwing is handled gracefully', async () => {
    const storage = { setItem: () => { throw new Error('disk full') } };
    const fakeResp = { status: 200, headers: { get: () => 'application/json' }, json: async () => ({ a: 1 }) };
    const fetchFn = jest.fn().mockResolvedValue(fakeResp);
    const res = await fetchParseAndCache(storage, '/p', 'u', 'GET', fetchFn, {});
    expect(res.rawData).toEqual({ a: 1 });
    // no exception thrown and savedKey is null because storage.setItem failed
    expect(res.savedKey).toBeNull();
  });
});
