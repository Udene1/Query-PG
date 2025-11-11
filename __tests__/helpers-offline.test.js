const { getOfflineCached, buildCacheKeys } = require('../lib/helpers');

describe('getOfflineCached', () => {
  test('returns endpoint cached value when present', () => {
    const storage = { _store: {}, getItem(k){ return this._store[k] ?? null }, setItem(k,v){ this._store[k]=String(v) } };
    const keys = buildCacheKeys('/p', 'u', 'GET');
    storage.setItem(keys[0], 'endpoint-cached');
    expect(getOfflineCached(storage, '/p', 'u', 'GET')).toBe('endpoint-cached');
  });

  test('returns url cached value when endpoint not present', () => {
    const storage = { _store: {}, getItem(k){ return this._store[k] ?? null }, setItem(k,v){ this._store[k]=String(v) } };
    const keys = buildCacheKeys('/p', 'u', 'GET');
    storage.setItem(keys[1], 'url-cached');
    expect(getOfflineCached(storage, '/p', 'u', 'GET')).toBe('url-cached');
  });

  test('handles storage throwing and returns null', () => {
    const storage = { getItem: () => { throw new Error('boom') } };
    expect(getOfflineCached(storage, '/p', 'u', 'GET')).toBeNull();
  });
});
