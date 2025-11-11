const { collectFormValues } = require('../lib/helpers');
const { JSDOM } = require('jsdom');

describe('collectFormValues', () => {
  test('extracts method, endpoint, params and bodyText from a shadowRoot', () => {
    const dom = new JSDOM(`<!doctype html><html><body>
      <select id="method"><option>GET</option><option selected>POST</option></select>
      <select id="endpoint-select"><option>/x</option></select>
      <input name="q" value="42" />
      <textarea name="body">{"a":1}</textarea>
    </body></html>`, { runScripts: 'dangerously' });
    const doc = dom.window.document;
    // Simulate a shadowRoot by using the document as the root for queries
    const res = collectFormValues(doc);
    expect(res.method).toBe('POST');
    expect(res.endpoint).toBe('/x');
    expect(res.params.q).toBe('42');
    expect(res.bodyText).toBe('{"a":1}');
  });
});
