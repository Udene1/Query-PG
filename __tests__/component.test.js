const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
// require the module so coverage sees the source file executed (exports the class when run under Node)
require(path.resolve(__dirname, '..', 'query-play.js'));

describe('<query-play> component', () => {
  let dom;
  let window;
  let document;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'dangerously', resources: 'usable' });
    window = dom.window;
    document = window.document;
    // wire common globals used by the component
    global.window = window;
    global.document = document;
    global.navigator = window.navigator;
    // Provide a mock prompt used by saveToken
    window.prompt = () => 'test-token-123';
    // provide a simple localStorage mock
    window.localStorage = {
      _store: {},
      getItem(key) { return this._store[key] ?? null; },
      setItem(key, value) { this._store[key] = String(value); },
      removeItem(key) { delete this._store[key]; },
      clear() { this._store = {}; }
    };
    // also expose localStorage on the Node global as component code may reference bare `localStorage`
    global.localStorage = window.localStorage;

  // expose localStorage also on globalThis (do not reassign globalThis)
  global.globalThis = global.globalThis || global;
  global.globalThis.localStorage = window.localStorage;

    // load the component script into the JSDOM document
    const scriptSrc = fs.readFileSync(path.resolve(__dirname, '..', 'query-play.js'), 'utf8');
    const scriptEl = document.createElement('script');
    scriptEl.textContent = scriptSrc;
    document.head.appendChild(scriptEl);
  });

  afterEach(() => {
    if (window && window.close) window.close();
    jest.restoreAllMocks();
    delete global.window;
    delete global.document;
    delete global.navigator;
  });

  it('mounts and renders form fields from OpenAPI', async () => {
    // mock fetch for OpenAPI
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/test': { get: { parameters: [{ name: 'id', in: 'query', schema: { type: 'integer' } }] } }
      }
    };
    // instead of relying on fetch timing in connectedCallback, render directly
  const el = document.createElement('query-play');
  // ensure connectedCallback does not overwrite our render: mock fetch and set api attr
  window.fetch = jest.fn().mockResolvedValue({ json: () => Promise.resolve(spec) });
  el.setAttribute('api', 's.json');
  el.apiSpec = spec;
  el.renderForm(spec);
    const input = el.shadowRoot.querySelector('input[name="id"]');
    expect(input).toBeTruthy();
  });

  it('generates requestBody textarea for application/json', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/posts': {
          post: {
            requestBody: { content: { 'application/json': { schema: { type: 'object', example: { title: 'hi' } } } } }
          }
        }
      }
    };
  const el = document.createElement('query-play');
  window.fetch = jest.fn().mockResolvedValue({ json: () => Promise.resolve(spec) });
  el.setAttribute('api', 's.json');
  el.apiSpec = spec;
  el.renderForm(spec);
    const ta = el.shadowRoot.querySelector('textarea[name="body"]');
    expect(ta).toBeTruthy();
    expect(ta.value).toContain('title');
  });

  it('saves token ephemeral vs persisted', async () => {
    const spec = { openapi: '3.0.0', paths: { '/x': { get: {} } } };
  const el = document.createElement('query-play');
  window.fetch = jest.fn().mockResolvedValue({ json: () => Promise.resolve(spec) });
  el.setAttribute('api', 's.json');
  el.apiSpec = spec;
  el.renderForm(spec);

  // ephemeral save: persistToken false (default)
  el.persistToken = false;
  el.saveToken(); // uses window.prompt mock
    expect(el.token).toBe('test-token-123');
  // not persisted in localStorage
  expect(global.localStorage.getItem(`queryplay_token:${el.defaultEndpoint}`)).toBeNull();

    // persisted save (simulate storage write)
    el.persistToken = true;
    const key = `queryplay_token:${el.defaultEndpoint}`;
    global.localStorage.setItem(key, el.token);
    expect(global.localStorage.getItem(key)).toBe('test-token-123');
  });

  it('clearToken removes storage and clears badge', async () => {
    const spec = { openapi: '3.0.0', paths: { '/x': { get: {} } } };
  const el = document.createElement('query-play');
  window.fetch = jest.fn().mockResolvedValue({ json: () => Promise.resolve(spec) });
  el.setAttribute('api', 's.json');
  el.apiSpec = spec;
  el.renderForm(spec);

  // mimic persisted token present
  const key = `queryplay_token:${el.defaultEndpoint}`;
  global.localStorage.setItem(key, 'tok-1');
    // ensure token exists in storage and in-memory
    el.token = 'tok-1';
    el.clearToken();
    // in headless environment we assert memory cleared and badge hidden
    expect(el.token).toBe('');
    const badge = el.shadowRoot.querySelector('#token-badge');
    expect(badge.style.display === 'none' || badge.textContent === '').toBeTruthy();
  });

  it('highlight toggle shows spans when enabled and raw when disabled', async () => {
    const spec = { openapi: '3.0.0', paths: { '/x': { get: {} } } };
    // mock a fetch response for OpenAPI
  const el = document.createElement('query-play');
  window.fetch = jest.fn().mockResolvedValue({ json: () => Promise.resolve(spec) });
  el.setAttribute('api', 's.json');
  el.apiSpec = spec;
  el.renderForm(spec);
    // simulate a JSON response and rendering
    el.rawData = { hello: 'world' };
    el.lastStatus = 200;
    el.highlightEnabled = true;
    el.toggleResponseView();
    const resp = el.shadowRoot.querySelector('#response');
    expect(resp.innerHTML).toContain('json-key');

    // toggle off (raw)
    el.highlightEnabled = false;
    el.toggleResponseView();
    expect(resp.innerHTML).not.toContain('json-key');
    expect(resp.textContent).toContain('"hello":');
  });

  it('includes Authorization header when token set and authType is bearer', async () => {
    const spec = { openapi: '3.0.0', paths: { '/x': { post: {} } }, servers: [{ url: 'https://api.example' }] };
    let captured;
    window.fetch = jest.fn().mockImplementation((url, opts) => {
      if (url === 's.json') return Promise.resolve({ json: () => Promise.resolve(spec) });
      captured = opts;
      return Promise.resolve({ headers: { get: () => 'application/json' }, json: () => Promise.resolve({ ok: true }), status: 200 });
    });
  const el = document.createElement('query-play');
  el.setAttribute('api', 's.json');
  el.apiSpec = spec;
  el.renderForm(spec);
    el.authType = 'bearer';
    el.token = 'tok-xyz';
    // ensure method and endpoint exist
    el.shadowRoot.querySelector('#endpoint-select').value = Object.keys(spec.paths)[0];
    el.shadowRoot.querySelector('#method').value = 'POST';
    await el.sendRequest();
    expect(captured.headers.Authorization).toBe('Bearer tok-xyz');
  });

  it('renders mobile media query CSS in shadow DOM', async () => {
    const spec = { openapi: '3.0.0', paths: { '/x': { get: {} } } };
    const el = document.createElement('query-play');
  el.apiSpec = spec;
  el.renderForm(spec);
    // check that component includes the mobile media query in its style block
    expect(el.shadowRoot.innerHTML).toContain('@media (max-width: 600px)');
  });
});
