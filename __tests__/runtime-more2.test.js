const runtime = require('../lib/runtime.js');
const helpers = require('../lib/helpers.js');

describe('runtime.orchestrateRequest remaining branches', () => {
  afterEach(() => jest.restoreAllMocks());

  test('calls helpers.parseAndCacheResponse when available after fetch', async () => {
    // ensure orchestrateFetch is absent so fallback path runs
    const origOrch = helpers.orchestrateFetch;
    try {
      delete helpers.orchestrateFetch;
      const parsed = { rawData: { v: 1 }, lastStatus: 200 };
      const parseSpy = jest.spyOn(helpers, 'parseAndCacheResponse').mockImplementation(async () => parsed);

      const fakeFetch = async () => ({ status: 200, headers: { get: () => 'application/json' }, json: async () => ({}) });
      let notified = null;
      const res = await runtime.orchestrateRequest({ apiSpec: { servers: [{ url: 'http://api' }] }, endpoint: '/pc', method: 'GET', fetchFn: fakeFetch, storage: null, onResult: (r) => { notified = r; } });
      expect(parseSpy).toHaveBeenCalled();
      expect(notified).not.toBeNull();
      expect(res).toBe(parsed);
    } finally {
      if (typeof origOrch !== 'undefined') helpers.orchestrateFetch = origOrch;
    }
  });

  test('parsed.error as string triggers onError and returns that string', async () => {
    jest.spyOn(helpers, 'orchestrateFetch').mockImplementation(async () => ({ error: 'some failure' }));
    const onError = jest.fn();
    const res = await runtime.orchestrateRequest({ apiSpec: { servers: [{ url: 'http://api' }] }, endpoint: '/str', method: 'GET', fetchFn: async () => {}, storage: null, onError });
    expect(onError).toHaveBeenCalledWith('some failure');
    expect(res.error).toBe('some failure');
  });

  test('onUnauthorized is called when lastStatus is 403 and onResult still called', async () => {
    const parsed = { rawData: { ok: true }, lastStatus: 403 };
    jest.spyOn(helpers, 'orchestrateFetch').mockImplementation(async () => parsed);
    let unauth = false; let got = null;
    const res = await runtime.orchestrateRequest({ apiSpec: { servers: [{ url: 'http://api' }] }, endpoint: '/u', method: 'GET', fetchFn: async () => {}, storage: null, onResult: (r) => { got = r; }, onUnauthorized: () => { unauth = true; } });
    expect(unauth).toBe(true);
    expect(got).not.toBeNull();
    expect(res).toBe(parsed);
  });
});
