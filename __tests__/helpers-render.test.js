const helpers = require('../lib/helpers.js');

describe('render helpers', () => {
  test('buildEndpointOptions renders options and selects default', () => {
    const paths = { '/pets': {}, '/users': {} };
    const html = helpers.buildEndpointOptions(paths, '/users');
    expect(html).toContain('<option');
    expect(html).toContain('/pets');
    expect(html).toContain('selected');
  });

  test('buildParamsHtml renders inputs for query/path params', () => {
    const params = [
      { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
      { name: 'id', in: 'path', schema: { type: 'string' } },
      { name: 'headerOnly', in: 'header', schema: { type: 'string' } }
    ];
    const html = helpers.buildParamsHtml(params);
    expect(html).toContain('name="limit"');
    expect(html).toContain('name="id"');
    expect(html).not.toContain('headerOnly');
  });

  test('buildBodyHtml includes textarea and schema placeholder', () => {
    const body = { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } }, example: { name: 'x' } } } } };
    const html = helpers.buildBodyHtml(body);
    expect(html).toContain('Request Body (JSON)');
    expect(html).toContain('textarea');
    expect(html).toContain('name');
  });

  test('renderAuthHtml shows token section when bearer detected or requested', () => {
    const spec = { components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } } };
    const html = helpers.renderAuthHtml(spec, { authType: 'bearer', token: 'abc', persistToken: true });
    expect(html).toContain('Auth (bearer)');
    expect(html).toContain('token-input');
    expect(html).toContain('Persist Token');
  });

  test('buildHistoryOptions renders history entries', () => {
    const history = [{ endpoint: '/a', method: 'GET' }, { endpoint: '/b', method: 'POST' }];
    const html = helpers.buildHistoryOptions(history);
    expect(html).toContain('/a');
    expect(html).toContain('/b');
  });

  test('buildDarkToggle returns correct emoji', () => {
    expect(helpers.buildDarkToggle(true)).toContain('🌙');
    expect(helpers.buildDarkToggle(false)).toContain('☀️');
  });

  test('buildResponseHtml formats highlighted JSON and raw text', () => {
    const rawData = { a: 1, b: 'x' };
    const htmlHighlighted = helpers.buildResponseHtml(rawData, '', 200, true);
    expect(htmlHighlighted).toContain('Status: 200');
    expect(htmlHighlighted).toContain('json-key');
    const htmlRaw = helpers.buildResponseHtml(null, 'plain text', 500, false);
    expect(htmlRaw).toContain('Status: 500');
    expect(htmlRaw).toContain('plain text');
  });
});
