// query-play.js
// Production-ready <query-play> web component
// Load helpers from lib when available (Node/tests) or from globalThis when running in browser
let helpers = null;
if (typeof module !== 'undefined' && module.exports) {
  try { helpers = require('./lib/helpers.js'); } catch (e) { helpers = globalThis.__qp_helpers || null; }
} else {
  helpers = (typeof globalThis !== 'undefined' && globalThis.__qp_helpers) ? globalThis.__qp_helpers : null;
}
// runtime provides higher-level orchestration for requests and websockets
let runtime = null;
if (typeof module !== 'undefined' && module.exports) {
  try { runtime = require('./lib/runtime.js'); } catch (e) { runtime = null; }
} else {
  runtime = (typeof globalThis !== 'undefined' && globalThis.__qp_runtime) ? globalThis.__qp_runtime : null;
}

// Internal storage accessor: prefer helpers.getStorage when available, otherwise fall back to global/localStorage
function _getStorage() {
  if (helpers && typeof helpers.getStorage === 'function') return helpers.getStorage();
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

class QueryPlay extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.schemaUrl = this.getAttribute('api') || '';
    this.defaultEndpoint = this.getAttribute('endpoint') || '';
    this.wsUrl = this.getAttribute('ws') || '';
    this.authType = this.getAttribute('auth-type') || 'none';
  this.orientation = this.getAttribute('orientation') || 'auto';
    this.token = '';
    this.persistToken = false; // default: ephemeral unless persisted by user
    this.highlightEnabled = true; // toggle for highlighted view
    this.rawData = null; // stored JSON object when response is JSON
    this.rawText = ''; // stored text when non-JSON
    this.lastStatus = ''; // last response status
    this.methods = ['GET', 'POST', 'PUT', 'DELETE'];
    this.darkMode = false;
    this.history = [];
    this.wsAttempts = 0;
    this.ws = null;
  }

  // (storage access moved to module-level _getStorage / helpers.getStorage)

  async connectedCallback() {
    if (!this.schemaUrl) {
      this.shadowRoot.innerHTML = '<p style="color:red">Missing api attribute!</p>';
      return;
    }
    try {
      const response = await fetch(this.schemaUrl);
      const spec = await response.json();
      this.apiSpec = spec;
      // Load any saved token for this endpoint (loads persisted token if present)
      this.loadToken();
      this.renderForm(spec);
      // If token is not persisted, ensure ephemeral tokens are cleared on unload
      if (!this.persistToken) {
        window.addEventListener('beforeunload', () => this.clearEphemeral());
      }
    } catch (err) {
      this.shadowRoot.innerHTML = `<p>Error loading schema: ${err.message}</p>`;
    }
  }

  renderLoading() {
    this.shadowRoot.innerHTML = '<p>Loading OpenAPI schema...</p>';
  }

  // Recursively render form fields for nested schemas
  renderSchemaFields(schema, prefix = '') {
    // delegate to helper when available
    if (helpers && helpers.renderSchemaFieldsHelper) return helpers.renderSchemaFieldsHelper(schema, prefix);
    // fallback to local implementation
    if (!schema) return '';
    if (schema.type === 'object' && schema.properties) {
      return Object.entries(schema.properties).map(([key, prop]) => {
        return this.renderSchemaFields(prop, prefix ? `${prefix}.${key}` : key);
      }).join('');
    }
    if (schema.type === 'array' && schema.items) {
      return `<label>${prefix} (array):</label>
        <textarea name="${prefix}" aria-label="${prefix} array" placeholder='[${JSON.stringify(schema.items, null, 2)}]'></textarea><br />`;
    }
    // Primitive
    const type = schema.type === 'integer' ? 'number' : schema.type || 'text';
    const def = schema.default !== undefined ? schema.default : '';
    return `<label>${prefix} (${type}):</label>
      <input type="${type}" name="${prefix}" aria-label="${prefix}" value="${def}" /><br />`;
  }

  renderForm(spec) {
    const paths = spec.paths || {};
    const endpoint = paths[this.defaultEndpoint] || paths[Object.keys(paths)[0]] || {};
    const method = Object.keys(endpoint)[0] || 'get';
    const op = endpoint[method] || {};
    let paramsHtml = '';
    if (helpers && helpers.buildParamsHtml) {
      paramsHtml = helpers.buildParamsHtml(op.parameters);
    } else {
      if (op.parameters) {
        op.parameters.forEach(param => {
          if (param.in === 'query' || param.in === 'path') {
            paramsHtml += `<label>${param.name} (${param.schema?.type || 'text'}):</label>
            <input type="${param.schema?.type === 'integer' ? 'number' : 'text'}" name="${param.name}" aria-label="${param.name}" value="${param.schema?.default || ''}" /><br />`;
          }
        });
      }
    }
    let bodyHtml = '';
    if (helpers && helpers.buildBodyHtml) {
      bodyHtml = helpers.buildBodyHtml(op.requestBody);
    } else {
      if (op.requestBody && op.requestBody.content && op.requestBody.content['application/json']) {
        const schema = op.requestBody.content['application/json'].schema;
        bodyHtml = `<label>Request Body (JSON):</label>
        <textarea name="body" aria-label="Request Body" placeholder='${JSON.stringify(schema, null, 2)}'>${JSON.stringify(schema.example || {}, null, 2)}</textarea><br />`;
        // Recursively render nested fields (for reference, not editable)
        bodyHtml += this.renderSchemaFields(schema);
      }
    }
    // Endpoint selector
  const endpointOptions = (helpers && helpers.buildEndpointOptions) ? helpers.buildEndpointOptions(paths, this.defaultEndpoint) : Object.keys(paths).map(p => `<option ${p === this.defaultEndpoint ? 'selected' : ''}>${p}</option>`).join('');
    // Auth UI: detect bearer from spec if present
    const securitySchemes = spec.components?.securitySchemes || {};
    const hasBearer = Object.keys(securitySchemes).some(key => securitySchemes[key]?.type === 'http' && securitySchemes[key]?.scheme === 'bearer');
    const defaultAuth = hasBearer ? 'bearer' : 'none';
    const showToken = this.authType === 'bearer' || defaultAuth === 'bearer';
    const maskedToken = this.token ? '*'.repeat(this.token.length) : '';
    const authHtml = (helpers && helpers.renderAuthHtml) ? helpers.renderAuthHtml(spec, { authType: this.authType, token: this.token, persistToken: this.persistToken }) : `
      <details ${defaultAuth === 'bearer' ? 'open' : ''}>
        <summary>Auth (${defaultAuth})</summary>
        <select id="auth-type" aria-label="Auth Type">
          <option value="none">None</option>
          <option value="bearer" ${defaultAuth === 'bearer' ? 'selected' : ''}>Bearer Token</option>
        </select>
        <div id="token-section" style="display:${showToken ? 'block' : 'none'};">
          <label for="token-input">Token:</label>
            <input type="password" id="token-input" value="${this.escapeHtml(maskedToken)}" placeholder="e.g., ghp_abc123..." aria-describedby="token-help" />
            <span id="token-badge" class="token-badge" aria-live="polite" style="display:none;margin-left:8px"></span>
            <button id="save-token">Save</button>
            <button id="clear-token">Clear</button>
          <label for="persist-toggle" style="display:inline-block;margin-left:8px;">
            <input type="checkbox" id="persist-toggle" ${this.persistToken ? 'checked' : ''} aria-label="Persist token in storage" />
            Persist Token (Storage)
          </label>
          <small id="token-help">Default ephemeral (clears on reload) unless you check Persist Token.</small>
        </div>
      </details>
    `;
    // Response history dropdown
  const historyOptions = (helpers && helpers.buildHistoryOptions) ? helpers.buildHistoryOptions(this.history) : this.history.map((h, i) => `<option value="${i}">${h.endpoint} [${h.method}]</option>`).join('');
  // Dark mode toggle
  const darkToggle = (helpers && helpers.buildDarkToggle) ? helpers.buildDarkToggle(this.darkMode) : `<button id="dark-toggle" aria-label="Toggle dark mode">${this.darkMode ? '🌙' : '☀️'}</button>`;
    // If helpers provide a buildFormHtml implementation, prefer it (reduces component size).
    if (helpers && typeof helpers.buildFormHtml === 'function') {
      this.shadowRoot.innerHTML = helpers.buildFormHtml(spec, {
        endpointOptions,
        paramsHtml,
        bodyHtml,
        authHtml,
        historyOptions,
        darkToggle,
        methods: this.methods,
        method,
        highlightEnabled: this.highlightEnabled,
      });
    } else {
      // Minimal fallback: include a small responsive style block (tests assert this media query exists)
      this.shadowRoot.innerHTML = `
        <style>@media (max-width: 600px) { :host { padding: 0.5em; } }</style>
        <div>
          <label>Endpoint</label>
          <select id="endpoint-select">${endpointOptions}</select>
          <label>Method</label>
          <select id="method">${this.methods.map(m => `<option ${m.toLowerCase() === method ? 'selected' : ''}>${m}</option>`).join('')}</select>
          <div id="params">${paramsHtml}</div>
          ${bodyHtml}
          ${authHtml}
          <button id="send-btn">Send</button>
          <div id="response"><pre><code>Response will appear here...</code></pre></div>
        </div>`;
    }
    // Bind events (guard elements in case a fallback/minimal template was used)
    const endpointEl = this.shadowRoot.querySelector('#endpoint-select');
    if (endpointEl) endpointEl.addEventListener('change', (e) => {
      this.defaultEndpoint = e.target.value;
      // reload token for new endpoint and re-render
      this.loadToken();
      this.renderForm(spec);
    });
    const sendBtnEl = this.shadowRoot.querySelector('#send-btn');
    if (sendBtnEl) sendBtnEl.onclick = () => this.sendRequest();
    const clearBtnEl = this.shadowRoot.querySelector('#clear-btn');
    if (clearBtnEl) clearBtnEl.onclick = () => this.clearResponse();
    const saveBtnEl = this.shadowRoot.querySelector('#save-btn');
    if (saveBtnEl) saveBtnEl.onclick = () => this.saveRequest();
    const historyEl = this.shadowRoot.querySelector('#history-select');
    if (historyEl) historyEl.onchange = (e) => this.loadHistory(e.target.value);
    // Copy response
    const copyBtn = this.shadowRoot.querySelector('#copy-btn');
    if (copyBtn) copyBtn.onclick = () => this.copyResponse();
  // Highlight toggle
  const highlightToggle = this.shadowRoot.querySelector('#highlight-toggle');
  if (highlightToggle) {
    highlightToggle.addEventListener('change', (e) => {
      this.highlightEnabled = e.target.checked;
      this.toggleResponseView();
    });
  }
  const darkToggleEl = this.shadowRoot.querySelector('#dark-toggle');
  if (darkToggleEl) darkToggleEl.onclick = () => this.toggleDarkMode();
    // Auth event bindings
    const authTypeEl = this.shadowRoot.querySelector('#auth-type');
    if (authTypeEl) {
      authTypeEl.addEventListener('change', (e) => {
        const section = this.shadowRoot.querySelector('#token-section');
        if (section) section.style.display = e.target.value === 'bearer' ? 'block' : 'none';
        if (e.target.value !== 'bearer') this.clearToken();
      });
    }
    const saveBtn = this.shadowRoot.querySelector('#save-token');
    if (saveBtn) saveBtn.onclick = () => this.saveToken();
    const clearBtn = this.shadowRoot.querySelector('#clear-token');
    if (clearBtn) clearBtn.onclick = () => this.clearToken();
    const persistToggle = this.shadowRoot.querySelector('#persist-toggle');
    if (persistToggle) {
      persistToggle.checked = !!this.persistToken;
      persistToggle.addEventListener('change', (e) => {
        this.persistToken = e.target.checked;
        if (!this.persistToken) {
          // clear ephemeral token from memory
          this.clearEphemeral();
        } else {
          // if persisting and token exists, store it
          const storage = _getStorage();
          if (this.token && storage) storage.setItem(`queryplay_token:${this.defaultEndpoint}`, this.token);
        }
      });
    }
    // WebSocket
    if (this.wsUrl && !this.ws) {
      this.connectWs();
    }
    // Ensure token badge reflects current state after render and bindings
    this.updateTokenBadge();
  }

  connectWs() {
    try {
      if (runtime && runtime.connectWsRuntime) {
        const ret = runtime.connectWsRuntime({ wsUrl: this.wsUrl, WebSocketCtor: (typeof WebSocket !== 'undefined') ? WebSocket : null, setTimeoutFn: (fn, t) => setTimeout(fn, t), onOpen: () => { this.wsAttempts = 0; this.shadowRoot.querySelector('#ws-status').textContent = '🟢 Live feedback connected'; }, onMessage: (evt) => { const resp = this.shadowRoot.querySelector('#response'); resp.textContent += `\n[Live]: ${evt.data}`; }, onError: () => this.shadowRoot.querySelector('#ws-status').textContent = '🔴 Live feedback error', onClose: () => { this.shadowRoot.querySelector('#ws-status').textContent = '⚪ Live feedback disconnected'; }, maxAttempts: 5 });
        if (ret && ret.ws) this.ws = ret.ws;
        return;
      }
      this.ws = new WebSocket(this.wsUrl);
    } catch (e) {
      this.shadowRoot.querySelector('#ws-status').textContent = '🔴 Live feedback failed to start';
      return;
    }
    // attach handlers via helper when available for easier testing
    const handlers = {
      onopen: () => {
        this.wsAttempts = 0;
        this.shadowRoot.querySelector('#ws-status').textContent = '🟢 Live feedback connected';
      },
      onmessage: (event) => {
        const resp = this.shadowRoot.querySelector('#response');
        resp.textContent += `\n[Live]: ${event.data}`;
      },
      onerror: () => this.shadowRoot.querySelector('#ws-status').textContent = '🔴 Live feedback error',
      onclose: () => {
        this.shadowRoot.querySelector('#ws-status').textContent = '⚪ Live feedback disconnected';
        // simple reconnect with backoff
        if (this.wsAttempts < 5) {
          this.wsAttempts++;
          setTimeout(() => this.connectWs(), 1000 * this.wsAttempts);
        }
      }
    };
    if (helpers && helpers.attachWsHandlers) {
      helpers.attachWsHandlers(this.ws, handlers);
    } else {
      this.ws.onopen = handlers.onopen;
      this.ws.onmessage = handlers.onmessage;
      this.ws.onerror = handlers.onerror;
      this.ws.onclose = handlers.onclose;
    }
  }

  async sendRequest() {
  const shadow = this.shadowRoot;
    // build request using helper when available
    // Collect form values via helper when available to keep DOM traversal testable
    let params = {};
    let bodyText = '';
    let endpoint = shadow.querySelector('#endpoint-select')?.value || '';
    let method = shadow.querySelector('#method')?.value || 'GET';
    if (helpers && typeof helpers.collectFormValues === 'function') {
      const fv = helpers.collectFormValues(shadow);
      params = fv.params || {};
      bodyText = fv.bodyText || '';
      endpoint = fv.endpoint || endpoint;
      method = fv.method || method;
    } else {
      params = Array.from(shadow.querySelectorAll('input[name]')).reduce((acc, el) => ({ ...acc, [el.name]: el.value }), {});
      bodyText = (shadow.querySelector('textarea[name="body"]') || {}).value || '';
      endpoint = endpoint;
      method = method;
    }
    let url = this.apiSpec.servers?.[0]?.url + endpoint || endpoint;
    let options = { method };
    let parsedBody = { ok: true, body: null };
    if (helpers && helpers.buildRequest) {
      const built = helpers.buildRequest(this.apiSpec.servers, endpoint, method, params, bodyText, this.authType, this.token);
      url = built.url; options = built.options; parsedBody = built.parsedBody;
    } else {
      const serverUrl = this.apiSpec.servers?.[0]?.url;
      url = (helpers && helpers.buildUrl) ? helpers.buildUrl(serverUrl, endpoint) : (serverUrl + endpoint || endpoint);
      // Insert path params and append query params
      Object.entries(params).forEach(([key, val]) => {
        if (endpoint.includes(`{${key}}`)) url = url.replace(`{${key}}`, val);
      });
      if (helpers && helpers.appendQueryParams) {
        url = helpers.appendQueryParams(url, Object.fromEntries(Object.entries(params).filter(([k]) => !endpoint.includes(`{${k}}`))));
      } else {
        Object.entries(params).forEach(([key, val]) => {
          if (!endpoint.includes(`{${key}}`)) url += url.includes('?') ? `&${key}=${val}` : `?${key}=${val}`;
        });
      }
      parsedBody = helpers && helpers.parseRequestBody ? helpers.parseRequestBody(bodyText) : { ok: true, body: null };
      options = { method, headers: (helpers && helpers.buildHeaders) ? helpers.buildHeaders(this.authType, this.token) : { 'Content-Type': 'application/json' }, body: parsedBody.ok && parsedBody.body ? JSON.stringify(parsedBody.body) : null };
    }
    const bodyEl = shadow.querySelector('textarea[name="body"]');
    let body = null;
    try {
      body = bodyEl ? JSON.parse(bodyEl.value || '{}') : null;
    } catch (e) {
      shadow.querySelector('#response').textContent = `JSON Error: ${e.message}`;
      return;
    }
    // Build query/path params
    // Insert path params and append query params
    Object.entries(params).forEach(([key, val]) => {
      if (endpoint.includes(`{${key}}`)) url = url.replace(`{${key}}`, val);
    });
    if (helpers && helpers.appendQueryParams) {
      url = helpers.appendQueryParams(url, Object.fromEntries(Object.entries(params).filter(([k]) => !endpoint.includes(`{${k}}`))));
    } else {
      Object.entries(params).forEach(([key, val]) => {
        if (!endpoint.includes(`{${key}}`)) url += url.includes('?') ? `&${key}=${val}` : `?${key}=${val}`;
      });
    }
    // Offline check/mocking (prefer globalThis.navigator for test environments, fallback to navigator)
    const isOnline = (typeof globalThis !== 'undefined' && globalThis.navigator && typeof globalThis.navigator.onLine !== 'undefined')
      ? globalThis.navigator.onLine
      : (typeof navigator !== 'undefined' && typeof navigator.onLine !== 'undefined')
        ? navigator.onLine
        : true;
    // expose last-known online state for test inspection
    this._lastOnline = isOnline;
    if (!isOnline) {
      const storage = _getStorage();
      const cached = (helpers && typeof helpers.getOfflineCached === 'function') ? helpers.getOfflineCached(storage, endpoint, url, method) : (helpers && helpers.getCachedResponse) ? helpers.getCachedResponse(storage, endpoint, url, method) : (storage ? storage.getItem(`queryplay:${endpoint}:${method}`) : null);
      if (cached) {
        shadow.querySelector('#offline-notice').style.display = 'block';
        shadow.querySelector('#response').textContent = `Cached: ${cached}`;
        return;
      } else {
        shadow.querySelector('#response').textContent = 'No cached response available offline.';
        return;
      }
    }
  const headers = (helpers && helpers.buildHeaders) ? helpers.buildHeaders(this.authType, this.token) : { 'Content-Type': 'application/json', ...(this.authType === 'bearer' && this.token ? { Authorization: `Bearer ${this.token}` } : {}) };
    try {
      const storage = _getStorage();
      if (runtime && runtime.orchestrateRequest) {
        const parsed = await runtime.orchestrateRequest({
          apiSpec: this.apiSpec,
          endpoint,
          method,
          params,
          bodyText,
          authType: this.authType,
          token: this.token,
          fetchFn: fetch.bind(globalThis),
          storage,
          onResult: ({ parsed }) => {
            // Normalize parsed response via helper when available to keep UI-free logic testable
            const normalized = (helpers && helpers.normalizeParsedResponse) ? helpers.normalizeParsedResponse(parsed) : (parsed || {});
            this.rawData = normalized.rawData;
            this.rawText = normalized.rawText;
            this.lastStatus = normalized.lastStatus || this.lastStatus;
            this.addHistory({ endpoint, method, output: normalized.output || (normalized.rawData ? JSON.stringify(normalized.rawData, null, 2) : normalized.rawText) });
            this.toggleResponseView();
          },
          onUnauthorized: () => {
            shadow.querySelector('#response').innerHTML += `<br><span style="color:orange;">🔒 Unauthorized — try re-entering token (or check CORS preflight).</span>`;
          },
          onError: (e) => {
            shadow.querySelector('#response').innerHTML = `<pre><code style="color:red;">Error: ${this.escapeHtml(e)}</code></pre>`;
          }
        });
        if (parsed && parsed.error) throw new Error(parsed.error);
      } else {
        const resp = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : null,
        });
        let contentType = resp.headers.get('content-type') || '';
        // Use helper to parse and cache response when available
        if (helpers && typeof helpers.fetchParseAndCache === 'function') {
          const parsed = await helpers.fetchParseAndCache(storage, endpoint, url, method, fetch.bind(globalThis), { method, headers, body: body ? JSON.stringify(body) : null });
          const normalized = (helpers && helpers.normalizeParsedResponse) ? helpers.normalizeParsedResponse(parsed) : (parsed || {});
          this.rawData = normalized.rawData;
          this.rawText = normalized.rawText;
          this.lastStatus = normalized.lastStatus || this.lastStatus;
          this.addHistory({ endpoint, method, output: normalized.output || (normalized.rawData ? JSON.stringify(normalized.rawData, null, 2) : normalized.rawText) });
          this.toggleResponseView();
        } else if (helpers && helpers.parseAndCacheResponse) {
          const parsed = await helpers.parseAndCacheResponse(storage, endpoint, url, method, resp);
          const normalized = (helpers && helpers.normalizeParsedResponse) ? helpers.normalizeParsedResponse(parsed) : (parsed || {});
          this.rawData = normalized.rawData;
          this.rawText = normalized.rawText;
          this.lastStatus = normalized.lastStatus || this.lastStatus;
          this.addHistory({ endpoint, method, output: normalized.output || (normalized.rawData ? JSON.stringify(normalized.rawData, null, 2) : normalized.rawText) });
          this.toggleResponseView();
        } else {
          if (contentType.includes('application/json')) {
            const json = await resp.json();
            const jsonStr = JSON.stringify(json, null, 2);
            // store raw and render via toggle
            this.rawData = json;
            this.rawText = '';
            this.lastStatus = resp.status;
            if (storage) storage.setItem(`queryplay:${endpoint}:${method}`, jsonStr);
            this.addHistory({ endpoint, method, output: jsonStr });
            this.toggleResponseView();
          } else {
            const text = await resp.text();
            const short = text.length > 10000 ? text.slice(0, 10000) + '\n...truncated...' : text;
            this.rawData = null;
            this.rawText = short;
            this.lastStatus = resp.status;
            if (storage) storage.setItem(`queryplay:${endpoint}:${method}`, short);
            this.addHistory({ endpoint, method, output: short });
            this.toggleResponseView();
          }
        }
      }
    } catch (err) {
      // On fetch/network errors, try to fall back to any cached response for resiliency
      try {
  const storage = _getStorage();
        let cached = null;
        if (storage) {
          const cachedFromHelper = (helpers && typeof helpers.getOfflineCached === 'function') ? helpers.getOfflineCached(storage, endpoint, url, method) : (helpers && helpers.getCachedResponse) ? helpers.getCachedResponse(storage, endpoint, url, method) : null;
          if (cachedFromHelper) {
            shadow.querySelector('#offline-notice').style.display = 'block';
            shadow.querySelector('#response').textContent = `Cached: ${cachedFromHelper}`;
            return;
          }
        }
      } catch (e) {
        // ignore storage errors and fall through to error render
      }
      shadow.querySelector('#response').innerHTML = `<pre><code style="color:red;">Error: ${this.escapeHtml(err.message)} (Check CORS?)</code></pre>`;
    }
    // WebSocket send
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'test', endpoint, method, data: body }));
    }
    // PostMessage for iframe parent
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'query-play-response', endpoint, method, body }, '*');
    }
  }

  clearResponse() {
    this.shadowRoot.querySelector('#response').textContent = 'Response cleared.';
  }

  saveRequest() {
    const shadow = this.shadowRoot;
    const method = shadow.querySelector('#method').value;
    const endpoint = shadow.querySelector('#endpoint-select').value;
    const bodyEl = shadow.querySelector('textarea[name="body"]');
    const body = bodyEl ? bodyEl.value : '';
    const req = { endpoint, method, body };
  const storage = _getStorage();
    const serialized = (helpers && helpers.serializeHistory) ? helpers.serializeHistory(req) : JSON.stringify(req);
    if (storage) storage.setItem(`queryplay:req:${endpoint}:${method}`, serialized);
    shadow.querySelector('#response').textContent = 'Request saved.';
    // also add to quick history
    this.addHistory({ endpoint, method, output: body });
  }

  addHistory(entry) {
    // Use helper to limit history when available
    if (helpers && helpers.limitHistory) {
      this.history = helpers.limitHistory(this.history, entry, 10);
    } else {
      this.history.push(entry);
      if (this.history.length > 10) this.history.shift();
    }
    this.renderForm(this.apiSpec);
  }

  loadHistory(idx) {
    if (!idx && idx !== 0) return;
    const i = parseInt(idx, 10);
    if (Number.isNaN(i)) return;
    const entry = this.history[i];
    if (entry) {
      // set rawData/rawText and re-render via toggle (delegate parsing to helper when available)
      if (helpers && helpers.parseHistoryEntry) {
        const parsed = helpers.parseHistoryEntry(entry);
        this.rawData = parsed.rawData;
        this.rawText = parsed.rawText;
        this.lastStatus = '';
      } else {
        try {
          const json = typeof entry.output === 'string' ? JSON.parse(entry.output) : entry.output;
          this.rawData = json;
          this.rawText = '';
          this.lastStatus = '';
        } catch (e) {
          this.rawData = null;
          this.rawText = entry.output;
          this.lastStatus = '';
        }
      }
      this.toggleResponseView();
    }
  }

  toggleDarkMode() {
    this.darkMode = !this.darkMode;
    if (this.darkMode) {
      this.setAttribute('dark', '');
    } else {
      this.removeAttribute('dark');
    }
    this.renderForm(this.apiSpec);
  }

  // Toggle rendering between highlighted HTML and raw text
  toggleResponseView() {
    const responseEl = this.shadowRoot.querySelector('#response');
    const statusLine = this.lastStatus ? `Status: ${this.lastStatus}\n` : '';
    if (!responseEl) return;
    // Prefer helper-rendered HTML when available (keeps UI-free logic in helpers)
    if (helpers && typeof helpers.buildResponseHtml === 'function') {
      responseEl.innerHTML = helpers.buildResponseHtml(this.rawData, this.rawText, this.lastStatus, this.highlightEnabled);
      return;
    }
    // Minimal fallback rendering: no complex highlighting, just escaped text.
    if (this.rawData !== null) {
      const jsonStr = JSON.stringify(this.rawData, null, 2);
      const body = this.highlightEnabled ? this.highlightJSON(jsonStr) : this.escapeHtml(statusLine + jsonStr);
      responseEl.innerHTML = `<pre><code>${this.escapeHtml(statusLine)}${body}</code></pre>`;
      return;
    }
    if (this.rawText) {
      responseEl.innerHTML = `<pre><code>${this.escapeHtml(statusLine + this.rawText)}</code></pre>`;
    }
  }

  // Token persistence (per-endpoint)
  loadToken() {
    // Load persisted token if present. Prefer helpers.getStorage/loadToken when available.
  const storage = _getStorage();
    const stored = (helpers && helpers.loadToken) ? helpers.loadToken(storage, this.defaultEndpoint) : (storage ? storage.getItem(`queryplay_token:${this.defaultEndpoint}`) : null);
    if (stored) {
      this.token = stored;
      this.persistToken = true;
    } else {
      this.token = '';
    }
    const input = this.shadowRoot?.querySelector('#token-input');
    if (input) input.value = this.token ? '*'.repeat(this.token.length) : '';
    // reflect persist state in the UI toggle if present
    const persistToggle = this.shadowRoot?.querySelector('#persist-toggle');
    if (persistToggle) persistToggle.checked = !!this.persistToken;
    // reflect badge state
    this.updateTokenBadge();
  }

  saveToken() {
    // Use a prompt for secure unmasked entry
    const entered = prompt('Enter full token (it will be saved according to your Persist Token setting):', '');
    if (!entered) return;
    this.token = entered;
    const input = this.shadowRoot.querySelector('#token-input');
    if (input) input.value = '*'.repeat(this.token.length);
  const storage = _getStorage();
    if (this.persistToken) {
      if (helpers && helpers.saveToken) helpers.saveToken(storage, this.defaultEndpoint, this.token);
      else if (storage) storage.setItem(`queryplay_token:${this.defaultEndpoint}`, this.token);
      this.shadowRoot.querySelector('#response').innerHTML = '<pre><code>✅ Token persisted to storage (masked).</code></pre>';
    } else {
      this.shadowRoot.querySelector('#response').innerHTML = '<pre><code>✅ Token set (ephemeral—clears on reload).</code></pre>';
    }
    // Update badge to reflect current token & persist state
    this.updateTokenBadge();
  }

  clearToken() {
    // Always remove persisted token from storage
  try { const storage = _getStorage(); if (storage) storage.removeItem(`queryplay_token:${this.defaultEndpoint}`); } catch (e) {}
    // Clear ephemeral token in memory
    this.clearEphemeral();
    // Update persist toggle UI if present
    const persistToggle = this.shadowRoot.querySelector('#persist-toggle');
    if (persistToggle) persistToggle.checked = false;
    this.persistToken = false;
    this.shadowRoot.querySelector('#response').innerHTML = '<pre><code>🗑️ Token cleared (storage + memory).</code></pre>';
    // Update badge to hide
    this.updateTokenBadge();
  }

  // Clear ephemeral (in-memory) token only
  clearEphemeral() {
    if (!this.token) return;
    this.token = '';
    const input = this.shadowRoot?.querySelector('#token-input');
    if (input) input.value = '';
  }

  // Update the small token status badge next to the input
  updateTokenBadge() {
    const badge = this.shadowRoot?.querySelector('#token-badge');
    if (!badge) return;
    if (!this.token) {
      badge.style.display = 'none';
      return;
    }
    badge.style.display = 'inline-block';
    const info = (helpers && helpers.tokenBadgeText) ? helpers.tokenBadgeText(this.token, this.persistToken) : { text: this.persistToken ? '🔒 Persisted' : '💨 Ephemeral', aria: this.persistToken ? 'Token status: Persisted to storage' : 'Token status: Ephemeral, clears on reload' };
    badge.textContent = info.text;
    badge.setAttribute('aria-label', info.aria);
    badge.style.color = this.persistToken ? '#4CAF50' : '#2196F3';
  }

  // Escape HTML to safely insert into innerHTML
  escapeHtml(str) {
    // Prefer helper implementation when available (keeps logic testable).
    if (helpers && typeof helpers.escapeHtmlHelper === 'function') return helpers.escapeHtmlHelper(str);
    // Minimal safe fallback for environments without helpers attached.
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Lightweight JSON highlighter (regex-based)
  highlightJSON(jsonStr, truncate = 10000) {
    // Delegate to helper when available (preferred, unit-tested there).
    if (helpers && typeof helpers.highlightJSONHelper === 'function') return helpers.highlightJSONHelper(jsonStr, truncate);
    // Full fallback highlighter (keeps behavior when helpers are not loaded into the page)
    let s = typeof jsonStr === 'string' ? jsonStr : String(jsonStr);
    if (s.length > truncate) {
      try { console.log('Full JSON (truncated in UI):', JSON.parse(jsonStr)); } catch(e) {}
      s = s.slice(0, truncate) + '\n... [truncated]';
    }
    // Escape first
    s = this.escapeHtml(s);
    // Keys ("key":)
    s = s.replace(/(\"(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\\"])*\"\s*:\s*)/g, '<span class="json-key">$1</span>');
    // Strings
    s = s.replace(/(\"(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\\"])*\")/g, '<span class="json-string">$1</span>');
    // Booleans & null
    s = s.replace(/\b(true|false|null)\b/g, '<span class="json-boolean">$1</span>');
    // Numbers
    s = s.replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="json-number">$1</span>');
    // Punctuation
    s = s.replace(/([{}\[\],:])/g, '<span class="json-punctuation">$1</span>');
    return s;
  }

  copyResponse() {
    // Always copy raw (un-highlighted) text for reliability
    let text = (helpers && helpers.buildCopyText) ? helpers.buildCopyText(this.rawData, this.rawText, this.lastStatus) : (this.lastStatus ? `Status: ${this.lastStatus}\n` : '') + (this.rawData !== null ? JSON.stringify(this.rawData, null, 2) : (this.rawText || ''));
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        const btn = this.shadowRoot.querySelector('#copy-btn');
        if (btn) {
          const original = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => (btn.textContent = original), 1500);
        }
      });
    } else {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }
}
// Register the element in browser environments
if (typeof window !== 'undefined' && typeof window.customElements !== 'undefined') {
  window.customElements.define('query-play', QueryPlay);
}
// Export for Node/Jest environment (for coverage / testing helpers)
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  // export QueryPlay and re-export helpers from lib if present
  const exported = { QueryPlay };
  try {
    const h = require('./lib/helpers.js');
    Object.assign(exported, h);
  } catch (e) {
    // fall back to any previously attached helpers
    if (typeof globalThis !== 'undefined' && globalThis.__qp_helpers) Object.assign(exported, globalThis.__qp_helpers);
  }
  module.exports = exported;
}
