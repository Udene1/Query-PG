const runtime = require('../lib/runtime.js');
const helpers = require('../lib/helpers.js');

describe('runtime.orchestrateRequest additional cases', () => {
  test('unauthorized response triggers onUnauthorized', async () => {
    const storage = { setItem: jest.fn(), getItem: jest.fn() };
    const fakeFetch = async () => ({ status: 401, headers: { get: () => 'application/json' }, json: async () => ({ error: 'no' }) });
    let unauth = false;
    const parsed = await runtime.orchestrateRequest({ apiSpec: { servers: [{ url: 'http://api' }] }, endpoint: '/auth', method: 'GET', fetchFn: fakeFetch, storage, onResult: () => {}, onUnauthorized: () => { unauth = true; }, onError: () => {} });
    expect(unauth).toBe(true);
    expect(parsed.lastStatus).toBe(401);
  });

  test('text response returns rawText and caches', async () => {
    const store = (() => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; }, _m: m }; })();
    const fakeFetch = async () => ({ status: 200, headers: { get: () => 'text/plain' }, text: async () => 'hello world' });
    const parsed = await runtime.orchestrateRequest({ apiSpec: { servers: [{ url: 'http://api' }] }, endpoint: '/t', method: 'POST', fetchFn: fakeFetch, storage: store, onResult: () => {} });
    expect(parsed.rawText).toContain('hello world');
    expect(store.getItem('queryplay:/t:POST')).toBe('hello world');
  });

  test('storage.setItem throwing leads to onError', async () => {
    const store = { setItem: () => { throw new Error('disk full'); }, getItem: () => null };
    const fakeFetch = async () => ({ status: 200, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) });
    let gotError = null;
    const res = await runtime.orchestrateRequest({ apiSpec: { servers: [{ url: 'http://api' }] }, endpoint: '/s', method: 'GET', fetchFn: fakeFetch, storage: store, onResult: () => {}, onError: (e) => { gotError = e; } });
    // Should return error object because storage.setItem threw inside fallback/orchestrate
    expect(gotError).toBeDefined();
    expect(res.error).toBeDefined();
  });
});

describe('runtime.connectWsRuntime backoff behavior', () => {
  test('calls setTimeout with calcReconnectDelay on close', () => {
    function FakeWS(url) { this.url = url; this.onopen = null; this.onmessage = null; this.onerror = null; this.onclose = null; this.close = () => {}; }
    // Count calls to setTimeout and capture delay
    let capturedDelay = null;
    const setTimeoutFn = (fn, t) => { capturedDelay = t; /* don't call fn to avoid recursion */ };
    let closed = false;
    const ctx = { wsUrl: 'ws://x', WebSocketCtor: FakeWS, setTimeoutFn, onOpen: () => {}, onMessage: () => {}, onError: () => {}, onClose: () => { closed = true; }, maxAttempts: 3 };
    const ret = runtime.connectWsRuntime(ctx);
    expect(ret.ws).toBeDefined();
    // simulate close
    if (ret.ws.onclose) ret.ws.onclose();
    const expected = helpers.calcReconnectDelay(1);
    expect(capturedDelay).toBe(expected);
    expect(closed).toBe(true);
  });
});
