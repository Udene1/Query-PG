const wsUtils = require('../lib/runtime-ws-utils.js');

describe('runtime-ws-utils.createWsHandlers', () => {
  test('creates handlers that call ctx callbacks', () => {
    let open = false; let msg = null; let err = false; let closed = false;
    const ctx = { onOpen: () => { open = true; }, onMessage: (e) => { msg = e; }, onError: () => { err = true; }, onClose: () => { closed = true; } };
    const handlers = wsUtils.createWsHandlers(ctx);
    handlers.onopen();
    handlers.onmessage('x');
    handlers.onerror();
    handlers.onclose();
    expect(open).toBe(true);
    expect(msg).toBe('x');
    expect(err).toBe(true);
    expect(closed).toBe(true);
  });
});

describe('runtime-ws-utils.scheduleReconnect', () => {
  test('schedules reconnect via provided setTimeoutFn and calls _reconnect', (done) => {
    const ctx = { setTimeoutFn: (fn, t) => { fn(); }, _reconnect: () => { done(); }, maxAttempts: 3 };
    const scheduled = wsUtils.scheduleReconnect(ctx, 0);
    expect(scheduled).toBe(true);
  });

  test('does not schedule when attempts exceed maxAttempts', () => {
    const ctx = { setTimeoutFn: (fn, t) => {}, _reconnect: () => {}, maxAttempts: 1 };
    const scheduled = wsUtils.scheduleReconnect(ctx, 1);
    expect(scheduled).toBe(false);
  });
});
