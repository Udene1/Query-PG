const helpers = require('../lib/helpers.js');

describe('cache helpers', () => {
  test('getCachedResponse returns first existing key', () => {
    const storage = (() => {
      const m = {};
      return {
        getItem: (k) => (k in m ? m[k] : null),
        setItem: (k, v) => { m[k] = v; },
        removeItem: (k) => { delete m[k]; },
      };
    })();
    storage.setItem('queryplay:/pets:GET', 'pets data');
    const v = helpers.getCachedResponse(storage, '/pets', 'http://api/pets', 'GET');
    expect(v).toBe('pets data');
  });

  test('getCachedResponse returns null when none present', () => {
    const storage = { getItem: () => null };
    const v = helpers.getCachedResponse(storage, '/x', 'u', 'GET');
    expect(v).toBeNull();
  });

  test('saveCache stores value under primary key', () => {
    const storage = (() => {
      const m = {};
      return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; }, removeItem: (k) => { delete m[k]; }, _m: m };
    })();
    const ok = helpers.saveCache(storage, '/a', 'http://api/a', 'POST', 'val');
    expect(ok).toBe(true);
    expect(storage.getItem('queryplay:/a:POST')).toBe('val');
  });

  test('getCachedResponse returns null if storage throws', () => {
    const storage = { getItem: () => { throw new Error('boom'); } };
    const v = helpers.getCachedResponse(storage, '/err', 'u', 'GET');
    expect(v).toBeNull();
  });
});
