const dispatch = require('../lib/runtime-dispatch.js');

describe('runtime-dispatch.normalizeError', () => {
  test('detects parsed.error object and returns message and original', () => {
    const parsed = { error: new Error('boom') };
    const out = dispatch.normalizeError(parsed);
    expect(out.isError).toBe(true);
    expect(out.message).toBe('boom');
    expect(out.original).toBe(parsed.error);
  });

  test('detects rawText Error: prefix', () => {
    const parsed = { rawText: 'Error: disk full' };
    const out = dispatch.normalizeError(parsed);
    expect(out.isError).toBe(true);
    expect(out.message).toBe('Error: disk full');
  });

  test('returns not error for normal parsed', () => {
    const out = dispatch.normalizeError({ rawData: { ok: true } });
    expect(out.isError).toBe(false);
  });
});

describe('runtime-dispatch.handleParsed', () => {
  test('calls onError with original when error object present and returns normalized message', () => {
    const parsed = { error: new Error('fail') };
    const ctx = { onError: jest.fn() };
    const res = dispatch.handleParsed(ctx, '/e', 'GET', parsed);
    expect(ctx.onError).toHaveBeenCalledWith(parsed.error);
    expect(res.error).toBe('fail');
  });

  test('calls onError with rawText when rawText Error present', () => {
    const parsed = { rawText: 'Error: boom' };
    const ctx = { onError: jest.fn() };
    const res = dispatch.handleParsed(ctx, '/r', 'GET', parsed);
    expect(ctx.onError).toHaveBeenCalledWith(parsed.rawText);
    expect(res.error).toBe('Error: boom');
  });

  test('calls onResult and onUnauthorized for 403 status', () => {
    const parsed = { rawData: { ok: true }, lastStatus: 403 };
    const ctx = { onResult: jest.fn(), onUnauthorized: jest.fn() };
    const res = dispatch.handleParsed(ctx, '/u', 'GET', parsed);
    expect(ctx.onResult).toHaveBeenCalled();
    expect(ctx.onUnauthorized).toHaveBeenCalled();
    expect(res).toBe(parsed);
  });

  test('swallows exceptions thrown by callbacks', () => {
    const parsed = { rawData: { ok: true }, lastStatus: 200 };
    const ctx = { onResult: () => { throw new Error('cb fail'); } };
    const res = dispatch.handleParsed(ctx, '/s', 'GET', parsed);
    expect(res).toBe(parsed);
  });
});
