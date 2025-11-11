const runtime = require('../lib/runtime.js');
const helpers = require('../lib/helpers.js');

describe('runtime.orchestrateRequest extra branches', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('uses helpers.buildRequest and helpers.orchestrateFetch when present', async () => {
    const built = { url: 'http://api/x', options: { method: 'GET' }, parsedBody: {} };
    const parsed = { rawData: { hello: 'world' }, lastStatus: 200 };
    jest.spyOn(helpers, 'buildRequest').mockImplementation(() => built);
    jest.spyOn(helpers, 'orchestrateFetch').mockImplementation(async () => parsed);

    const onResult = jest.fn();
    const res = await runtime.orchestrateRequest({ apiSpec: {}, endpoint: '/x', method: 'GET', fetchFn: async () => {}, storage: null, onResult });
    expect(onResult).toHaveBeenCalled();
    expect(res).toBe(parsed);
  });

  test('returns normalized error when helpers.orchestrateFetch returns parsed.error', async () => {
    const err = new Error('boom');
    jest.spyOn(helpers, 'orchestrateFetch').mockImplementation(async () => ({ error: err }));
    const onError = jest.fn();
    const res = await runtime.orchestrateRequest({ apiSpec: { servers: [{ url: 'http://api' }] }, endpoint: '/e', method: 'GET', fetchFn: async () => {}, storage: null, onError });
    expect(onError).toHaveBeenCalledWith(err);
    expect(res.error).toBe('boom');
  });

  test('treats rawText beginning with "Error:" as an error and calls onError', async () => {
    jest.spyOn(helpers, 'orchestrateFetch').mockImplementation(async () => ({ rawText: 'Error: disk full' }));
    const onError = jest.fn();
    const res = await runtime.orchestrateRequest({ apiSpec: { servers: [{ url: 'http://api' }] }, endpoint: '/r', method: 'GET', fetchFn: async () => {}, storage: null, onError });
    expect(onError).toHaveBeenCalledWith('Error: disk full');
    expect(res.error).toBe('Error: disk full');
  });

  test('fetchFn throwing is caught and onError invoked', async () => {
    const badFetch = async () => { throw new Error('network fail'); };
    const onError = jest.fn();
    const res = await runtime.orchestrateRequest({ apiSpec: { servers: [{ url: 'http://api' }] }, endpoint: '/f', method: 'GET', fetchFn: badFetch, storage: null, onError });
    expect(onError).toHaveBeenCalled();
    expect(res.error).toBe('network fail');
  });
});

describe('runtime.connectWsRuntime attach handlers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('delegates to helpers.attachWsHandlers when available', () => {
    function FakeWS(url) { this.url = url; this.onopen = null; this.onmessage = null; this.onerror = null; this.onclose = null; this.close = () => {}; }
    const attachSpy = jest.spyOn(helpers, 'attachWsHandlers').mockImplementation((ws, handlers) => {
      // attach handlers to ws to simulate helper behavior
      ws.onopen = handlers.onopen;
      ws.onmessage = handlers.onmessage;
      ws.onerror = handlers.onerror;
      ws.onclose = handlers.onclose;
    });

    const ctx = { wsUrl: 'ws://x', WebSocketCtor: FakeWS, setTimeoutFn: (fn, t) => fn(), onOpen: () => {}, onMessage: () => {}, onError: () => {}, onClose: () => {}, maxAttempts: 1 };
    const ret = runtime.connectWsRuntime(ctx);
    expect(ret.ws).toBeDefined();
    expect(attachSpy).toHaveBeenCalled();
  });
});
