const runtime = require('../lib/runtime.js');

describe('runtime.orchestrateRequest', () => {
  test('returns error when fetchFn missing', async () => {
    const res = await runtime.orchestrateRequest(null);
    expect(res.error).toBeDefined();
  });

  test('calls onResult for successful JSON fetch', async () => {
    const storage = (() => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; }, _m: m }; })();
    const fakeFetch = async (url, opts) => ({ status: 200, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) });
    let notified = null;
    const parsed = await runtime.orchestrateRequest({ apiSpec: { servers: [{ url: 'http://api' }] }, endpoint: '/a', method: 'GET', params: {}, bodyText: '', authType: 'none', token: '', fetchFn: fakeFetch, storage, onResult: (r) => { notified = r; } });
    expect(notified).not.toBeNull();
    expect(parsed.rawData).toEqual({ ok: true });
  });
});

describe('runtime.connectWsRuntime', () => {
  test('returns error when missing params', () => {
    const res = runtime.connectWsRuntime(null);
    expect(res.error).toBeDefined();
  });

  test('attaches handlers and returns ws wrapper', () => {
    function FakeWS(url) { this.url = url; this.onopen = null; this.onmessage = null; this.onerror = null; this.onclose = null; this.close = () => {}; }
    FakeWS.prototype.triggerOpen = function() { if (this.onopen) this.onopen(); };
    const ctx = { wsUrl: 'ws://x', WebSocketCtor: FakeWS, setTimeoutFn: (fn, t) => fn(), onOpen: () => {}, onMessage: () => {}, onError: () => {}, onClose: () => {}, maxAttempts: 1 };
    const ret = runtime.connectWsRuntime(ctx);
    expect(ret.ws).toBeDefined();
    expect(typeof ret.close).toBe('function');
  });
});
