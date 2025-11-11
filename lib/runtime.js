const helpers = require('./helpers.js');
const utils = require('./runtime-utils.js');
const dispatch = require('./runtime-dispatch.js');

// Orchestrate a request end-to-end: build URL/options, fetch, cache, and notify via callbacks.
async function orchestrateRequest(ctx) {
  // ctx: { apiSpec, endpoint, method, params, bodyText, authType, token, fetchFn, storage, onResult(result), onUnauthorized(), onError(err) }
  if (!ctx || !ctx.fetchFn) return { error: 'missing context or fetchFn' };
  const { apiSpec, endpoint, method, params = {}, bodyText = '', authType = 'none', token = '', fetchFn, storage } = ctx;
  // Build request using helpers.buildRequest when available
  let built;
  if (helpers && helpers.buildRequest) {
    built = helpers.buildRequest(apiSpec?.servers, endpoint, method, params, bodyText, authType, token);
  } else {
    built = utils.minimalBuild(apiSpec, endpoint, method, params, bodyText, authType, token, helpers);
  }

  try {
    const parsed = await (helpers && helpers.orchestrateFetch ? helpers.orchestrateFetch(fetchFn, storage, endpoint, built.url, method, built.options) : (async () => {
      const resp = await fetchFn(built.url, built.options);
      if (helpers && helpers.parseAndCacheResponse) return await helpers.parseAndCacheResponse(storage, endpoint, built.url, method, resp);
      // fallback parse via utils so it is testable
      return await utils.fallbackParseResponse(storage, endpoint, built.url, method, resp);
    })());

    // Delegate normalization and notification to dispatch handlers
    const after = dispatch.handleParsed(ctx, endpoint, method, parsed);
    return after;
  } catch (e) {
    if (ctx.onError) ctx.onError(e.message || String(e));
    return { error: e.message || String(e) };
  }
}

// WebSocket connect helper: returns an object with close() and ws
function connectWsRuntime(ctx) {
  // ctx: { wsUrl, WebSocketCtor, setTimeoutFn, onOpen, onMessage, onError, onClose, maxAttempts }
  if (!ctx || !ctx.WebSocketCtor || !ctx.wsUrl) return { error: 'missing parameters' };
  const ws = new ctx.WebSocketCtor(ctx.wsUrl);
  // create handlers using ws-utils if available or inline
  let handlers;
  try {
    const wsUtils = require('./runtime-ws-utils.js');
    handlers = wsUtils.createWsHandlers(ctx);
    // wire reconnect callback for scheduleReconnect
    ctx._reconnect = () => connectWsRuntime(ctx);
  } catch (e) {
    handlers = {
      onopen: () => { if (ctx.onOpen) ctx.onOpen(); },
      onmessage: (evt) => { if (ctx.onMessage) ctx.onMessage(evt); },
      onerror: () => { if (ctx.onError) ctx.onError(); },
      onclose: () => { if (ctx.onClose) ctx.onClose(); }
    };
  }

  if (helpers && helpers.attachWsHandlers) helpers.attachWsHandlers(ws, handlers);
  else {
    ws.onopen = handlers.onopen;
    ws.onmessage = handlers.onmessage;
    ws.onerror = handlers.onerror;
    ws.onclose = () => {
      handlers.onclose();
      // schedule reconnect using runtime-ws-utils
      try {
        const wsUtils = require('./runtime-ws-utils.js');
        wsUtils.scheduleReconnect(ctx, (ctx._attempts || 0));
        ctx._attempts = (ctx._attempts || 0) + 1;
      } catch (e) {}
    };
  }
  return { ws, close: () => { try { ws.close(); } catch (e) {} } };
}

module.exports = { orchestrateRequest, connectWsRuntime };
