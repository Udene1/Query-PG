// Helpers for creating WebSocket handlers and scheduling reconnects.
const helpers = require('./helpers.js');

function createWsHandlers(ctx) {
  // returns handlers expected by attachWsHandlers or direct assignment
  return {
    onopen: () => { if (ctx) { ctx._attempts = 0; } if (ctx.onOpen) ctx.onOpen(); },
    onmessage: (evt) => { if (ctx.onMessage) ctx.onMessage && ctx.onMessage(evt); },
    onerror: () => { if (ctx.onError) ctx.onError(); },
    onclose: () => {
      if (ctx.onClose) ctx.onClose();
      // schedule reconnect when using attachWsHandlers path as well
      try {
        // increment attempts and schedule
        const curr = ctx._attempts || 0;
        scheduleReconnect(ctx, curr);
        ctx._attempts = curr + 1;
      } catch (e) {}
    }
  };
}

function scheduleReconnect(ctx, attempts) {
  const maxAttempts = ctx.maxAttempts || 5;
  if (attempts >= maxAttempts) return false;
  const next = attempts + 1;
  const delay = (helpers && helpers.calcReconnectDelay) ? helpers.calcReconnectDelay(next) : 1000 * next;
  const tfn = ctx.setTimeoutFn || setTimeout;
  tfn(() => {
    try { ctx._reconnect && ctx._reconnect(); } catch (e) {}
  }, delay);
  return true;
}

module.exports = { createWsHandlers, scheduleReconnect };
