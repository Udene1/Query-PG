const helpers = require('../lib/helpers.js');

describe('ws helpers', () => {
  test('calcReconnectDelay returns linear delays and caps', () => {
    expect(helpers.calcReconnectDelay(1)).toBe(1000);
    expect(helpers.calcReconnectDelay(2)).toBe(2000);
    expect(helpers.calcReconnectDelay(50, 1000, 30000)).toBe(30000);
  });

  test('attachWsHandlers assigns functions to ws', () => {
    const ws = {};
    const handlers = {
      onopen: () => {},
      onmessage: () => {},
      onerror: () => {},
      onclose: () => {}
    };
    const ok = helpers.attachWsHandlers(ws, handlers);
    expect(ok).toBe(true);
    expect(typeof ws.onopen).toBe('function');
    expect(typeof ws.onmessage).toBe('function');
    expect(typeof ws.onerror).toBe('function');
    expect(typeof ws.onclose).toBe('function');
  });
});
