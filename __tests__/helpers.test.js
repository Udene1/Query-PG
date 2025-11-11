const path = require('path');
const { escapeHtmlHelper, highlightJSONHelper, renderSchemaFieldsHelper, buildCacheKeys, buildUrl, buildHeaders, saveToken, loadToken, formatStatusText, appendQueryParams, parseAndCacheResponse } = require(path.resolve(__dirname, '..', 'lib', 'helpers.js'));

describe('helpers', () => {
  test('escapeHtmlHelper escapes special characters', () => {
    expect(escapeHtmlHelper('<div>&"</div>')).toContain('&lt;div&gt;');
    expect(escapeHtmlHelper('<>&')).toContain('&lt;&gt;&amp;');
    expect(escapeHtmlHelper(123)).toBe(123);
  });

  test('highlightJSONHelper highlights numbers, booleans, strings and keys', () => {
    const obj = { n: 42, b: true, s: "hello", x: null };
    const json = JSON.stringify(obj, null, 2);
    const out = highlightJSONHelper(json);
    expect(out).toContain('json-number');
    expect(out).toContain('json-boolean');
    expect(out).toContain('json-string');
    expect(out).toContain('json-key');
  });

  test('highlightJSONHelper truncates long JSON safely', () => {
    const big = JSON.stringify({a: 'x'.repeat(20000)});
    const out = highlightJSONHelper(big, 100);
    expect(out).toContain('truncated');
  });

  test('renderSchemaFieldsHelper renders primitives, arrays and nested objects', () => {
    const schema = { type: 'object', properties: { a: { type: 'object', properties: { b: { type: 'integer' } } }, arr: { type: 'array', items: { type: 'string' } } } };
    const html = renderSchemaFieldsHelper(schema, 'root');
    expect(html).toContain('root.a.b');
    expect(html).toContain('root.arr');
  });

  test('buildCacheKeys returns endpoint and url based keys', () => {
    const keys = buildCacheKeys('/p', 'https://api/p', 'GET');
    expect(keys).toContain('queryplay:/p:GET');
    expect(keys).toContain('queryplay:https://api/p:GET');
  });
  test('buildUrl and buildHeaders work', () => {
    expect(buildUrl('https://api', '/p')).toBe('https://api/p');
    expect(buildUrl('https://api/', '/p')).toBe('https://api/p');
    expect(buildHeaders('bearer', 'tok').Authorization).toContain('Bearer');
  });

  test('token storage helpers and formatStatusText', () => {
    const storage = { _s: {}, setItem(k,v){ this._s[k]=String(v) }, getItem(k){ return this._s[k] ?? null } };
    expect(saveToken(storage, '/p', 'tkn')).toBe(true);
    expect(loadToken(storage, '/p')).toBe('tkn');
    expect(formatStatusText(200, 'ok')).toContain('Status: 200');
  });

  test('appendQueryParams adds params correctly', () => {
    expect(appendQueryParams('https://api/p', { a: 1, b: 'x' })).toContain('?a=1');
    expect(appendQueryParams('https://api/p?c=2', { a: 'x' })).toContain('&a=x');
  });

  test('parseAndCacheResponse saves JSON and text responses', async () => {
    const storage = { _s: {}, setItem(k,v){ this._s[k]=String(v) }, getItem(k){ return this._s[k] ?? null } };
    const jsonResp = { status: 200, headers: { get: (h) => h === 'content-type' ? 'application/json' : '' }, json: async () => ({ ok: true }), text: async () => 'x' };
    const parsedJson = await parseAndCacheResponse(storage, '/p', 'https://api/p', 'GET', jsonResp);
    expect(parsedJson.rawData).toEqual({ ok: true });
    expect(storage.getItem('queryplay:/p:GET')).toContain('ok');

    const txtResp = { status: 200, headers: { get: (h) => h === 'content-type' ? 'text/plain' : '' }, json: async () => ({}), text: async () => 'hello' };
    const parsedTxt = await parseAndCacheResponse(storage, '/t', 'https://api/t', 'GET', txtResp);
    expect(parsedTxt.rawText).toContain('hello');
    expect(storage.getItem('queryplay:/t:GET')).toContain('hello');
  });

  test('parseRequestBody accepts json or returns error', () => {
    const { parseRequestBody } = require(path.resolve(__dirname, '..', 'lib', 'helpers.js'));
    expect(parseRequestBody('')).toEqual({ ok: true, body: null });
    expect(parseRequestBody('{"a":1}').ok).toBe(true);
    expect(parseRequestBody('{x}').ok).toBe(false);
  });

  test('serializeHistory and tokenBadgeText', () => {
    const { serializeHistory, tokenBadgeText } = require(path.resolve(__dirname, '..', 'lib', 'helpers.js'));
    const s = serializeHistory({a:1});
    expect(s).toContain('a');
    expect(tokenBadgeText('t', true).text).toContain('Persisted');
    expect(tokenBadgeText('', false).text).toBe('');
  });

  test('buildRequest assembles url and options', () => {
    const { buildRequest } = require(path.resolve(__dirname, '..', 'lib', 'helpers.js'));
    const servers = [{ url: 'https://api' }];
    const res = buildRequest(servers, '/p', 'GET', { a: 1, id: '42' }, '', 'bearer', 'tk');
    expect(res.url).toContain('/p');
    expect(res.options.method).toBe('GET');
    expect(res.options.headers.Authorization).toContain('Bearer');
  });

  test('limitHistory and formatFetchError', () => {
    const { limitHistory, formatFetchError } = require(path.resolve(__dirname, '..', 'lib', 'helpers.js'));
    const h = limitHistory([{a:1}], {b:2}, 1);
    expect(h.length).toBe(1);
    expect(formatFetchError(new Error('boom'))).toContain('boom');
  });
});
