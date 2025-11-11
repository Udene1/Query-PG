const helpers = require('../lib/helpers.js');

// Mock a fetch response object for JSON and text
function makeJsonResp(obj, status = 200) {
  return {
    status,
    headers: { get: (k) => 'application/json' },
    json: async () => obj,
  };
}

function makeTextResp(text, status = 200) {
  return {
    status,
    headers: { get: (k) => 'text/plain' },
    text: async () => text,
  };
}

describe('orchestrateFetch', () => {
  test('parses JSON response and caches when storage present', async () => {
    const storage = (() => {
      const m = {};
      return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; }, _m: m };
    })();
    const fetchFn = async () => makeJsonResp({ hello: 'x' }, 201);
    const res = await helpers.orchestrateFetch(fetchFn, storage, '/pets', 'http://api/pets', 'GET', {});
    expect(res.rawData).toEqual({ hello: 'x' });
    expect(res.lastStatus).toBe(201);
    expect(storage.getItem('queryplay:/pets:GET')).toBeDefined();
  });

  test('parses text response and caches', async () => {
    const storage = (() => {
      const m = {};
      return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; }, _m: m };
    })();
    const fetchFn = async () => makeTextResp('plain', 202);
    const res = await helpers.orchestrateFetch(fetchFn, storage, '/a', 'u', 'POST', {});
    expect(res.rawText).toContain('plain');
    expect(res.lastStatus).toBe(202);
    expect(storage.getItem('queryplay:/a:POST')).toBe('plain');
  });

  test('returns error when fetch throws', async () => {
    const fetchFn = async () => { throw new Error('boom'); };
    const res = await helpers.orchestrateFetch(fetchFn, null, '/x', 'u', 'GET', {});
    expect(res.error).toBeDefined();
  });
});
