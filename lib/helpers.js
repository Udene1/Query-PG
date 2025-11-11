// lib/helpers.js - pure helper functions for query-play

function escapeHtmlHelper(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightJSONHelper(jsonStr, truncate = 10000) {
  if (typeof jsonStr !== 'string') jsonStr = String(jsonStr);
  if (jsonStr.length > truncate) {
    try { console.log('Full JSON (truncated in UI):', JSON.parse(jsonStr)); } catch(e) {}
    jsonStr = jsonStr.slice(0, truncate) + '\n... [truncated]';
  }
  let s = escapeHtmlHelper(jsonStr);
  s = s.replace(/(\"(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\\"])*\"\s*:\s*)/g, '<span class="json-key">$1</span>');
  s = s.replace(/(\"(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\\"])*\")/g, '<span class="json-string">$1</span>');
  s = s.replace(/\b(true|false|null)\b/g, '<span class="json-boolean">$1</span>');
  s = s.replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="json-number">$1</span>');
  s = s.replace(/([{}\[\],:])/g, '<span class="json-punctuation">$1</span>');
  return s;
}

function renderSchemaFieldsHelper(schema, prefix = '') {
  if (!schema) return '';
  if (schema.type === 'object' && schema.properties) {
    return Object.entries(schema.properties).map(([key, prop]) => {
      return renderSchemaFieldsHelper(prop, prefix ? `${prefix}.${key}` : key);
    }).join('');
  }
  if (schema.type === 'array' && schema.items) {
    return `<label>${prefix} (array):</label>\n        <textarea name="${prefix}" aria-label="${prefix} array" placeholder='[${JSON.stringify(schema.items, null, 2)}]'></textarea><br />`;
  }
  const type = schema.type === 'integer' ? 'number' : schema.type || 'text';
  const def = schema.default !== undefined ? schema.default : '';
  return `<label>${prefix} (${type}):</label>\n      <input type="${type}" name="${prefix}" aria-label="${prefix}" value="${def}" /><br />`;
}

function buildCacheKeys(endpoint, url, method) {
  return [`queryplay:${endpoint}:${method}`, `queryplay:${url}:${method}`];
}

function buildUrl(serverUrl, endpoint) {
  if (!serverUrl) return endpoint;
  return serverUrl.endsWith('/') && endpoint.startsWith('/') ? serverUrl.slice(0, -1) + endpoint : serverUrl + endpoint;
}

// Provide safe access to a storage object (works in Node tests and browsers)
function getStorage() {
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

function buildHeaders(authType, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (authType === 'bearer' && token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function saveToken(storage, endpoint, token) {
  if (!storage) return false;
  try { storage.setItem(`queryplay_token:${endpoint}`, token); return true; } catch(e) { return false; }
}

function loadToken(storage, endpoint) {
  if (!storage) return null;
  try { return storage.getItem(`queryplay_token:${endpoint}`) } catch(e) { return null; }
}

function formatStatusText(status, text) {
  const statusLine = status ? `Status: ${status}\n` : '';
  if (!text) return statusLine;
  return statusLine + String(text);
}

function appendQueryParams(url, params) {
  if (!params || typeof params !== 'object' || Object.keys(params).length === 0) return url;
  const u = url.includes('?') ? url : url;
  const qry = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
  return u + (u.includes('?') ? '&' : '?') + qry;
}

// Parse a fetch-like response and optionally cache the result using storage and keys
async function parseAndCacheResponse(storage, endpoint, url, method, resp) {
  const result = { rawData: null, rawText: '', lastStatus: resp.status, savedKey: null };
  try {
    const contentType = (resp.headers && typeof resp.headers.get === 'function') ? (resp.headers.get('content-type') || '') : '';
    if (contentType.includes('application/json')) {
      const json = await resp.json();
      const jsonStr = JSON.stringify(json, null, 2);
      result.rawData = json;
      result.rawText = '';
      // save to storage using helper keys
      if (storage) {
        const keys = buildCacheKeys(endpoint, url, method);
        storage.setItem(keys[0], jsonStr);
        result.savedKey = keys[0];
      }
      return result;
      // Render helpers for the form (return HTML fragments)
    } else {
      const text = await resp.text();
      const short = text.length > 10000 ? text.slice(0, 10000) + '\n...truncated...' : text;
      result.rawData = null;
      result.rawText = short;
      if (storage) {
        const keys = buildCacheKeys(endpoint, url, method);
        storage.setItem(keys[0], short);
        result.savedKey = keys[0];
      }
      return result;
    }
  } catch (e) {
    // If parsing fails, try to return a reasonable error text
    result.rawData = null;
    result.rawText = `Error: ${e.message}`;
    return result;
  }
}

  // Normalize parsed response objects into a canonical shape used by the UI/runtime
  function normalizeParsedResponse(parsed) {
    const out = { rawData: null, rawText: '', lastStatus: null, output: '' };
    if (!parsed) return out;
    // If parsed contains an explicit error string/object, prefer that as output
    if (parsed.error) {
      const msg = (parsed.error && parsed.error.message) ? parsed.error.message : String(parsed.error);
      out.rawText = `Error: ${msg}`;
      out.output = out.rawText;
      return out;
    }
    // standard fields
    out.rawData = (typeof parsed.rawData !== 'undefined') ? parsed.rawData : null;
    out.rawText = (typeof parsed.rawText === 'string') ? parsed.rawText : (out.rawData ? '' : '');
    out.lastStatus = (typeof parsed.lastStatus !== 'undefined') ? parsed.lastStatus : null;
    // If parseAndCacheResponse used rawText to signal an error, propagate it
    if (typeof out.rawText === 'string' && out.rawText.indexOf('Error:') === 0) {
      out.output = out.rawText;
      out.rawData = null;
      return out;
    }
    // Build history/display output: prefer pretty JSON when rawData present
    if (out.rawData !== null) {
      try { out.output = JSON.stringify(out.rawData, null, 2); } catch (e) { out.output = String(out.rawData); }
    } else if (out.rawText) {
      out.output = out.rawText;
    }
    return out;
  }

  module.exports.normalizeParsedResponse = normalizeParsedResponse;

module.exports = {
  escapeHtmlHelper,
  highlightJSONHelper,
  renderSchemaFieldsHelper,
  buildCacheKeys,
  buildUrl,
  buildHeaders,
  saveToken,
  loadToken,
  formatStatusText,
};
// export new helpers
module.exports.appendQueryParams = appendQueryParams;
module.exports.parseAndCacheResponse = parseAndCacheResponse;

// Parse request body text safely
function parseRequestBody(text) {
  if (!text) return { ok: true, body: null };
  try {
    const obj = JSON.parse(text);
    return { ok: true, body: obj };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Serialize history entry for storage/display
function serializeHistory(entry) {
  try { return JSON.stringify(entry); } catch (e) { return String(entry); }
}

// Token badge text based on token and persist flag
function tokenBadgeText(token, persist) {
  if (!token) return { text: '', aria: 'No token' };
  if (persist) return { text: '🔒 Persisted', aria: 'Token status: Persisted to storage' };
  return { text: '💨 Ephemeral', aria: 'Token status: Ephemeral, clears on reload' };
}

module.exports.parseRequestBody = parseRequestBody;
module.exports.serializeHistory = serializeHistory;
module.exports.tokenBadgeText = tokenBadgeText;

// Ensure normalizeParsedResponse is exported (may have been defined earlier)
if (typeof normalizeParsedResponse === 'function') module.exports.normalizeParsedResponse = normalizeParsedResponse;

// Build request URL and fetch options (method, headers, body)
function buildRequest(apiSpecServers, endpoint, method, params = {}, bodyText = '', authType = 'none', token = '') {
  const serverUrl = Array.isArray(apiSpecServers) && apiSpecServers[0] ? apiSpecServers[0].url : '';
  let url = buildUrl(serverUrl, endpoint);
  // Replace path params
  Object.entries(params).forEach(([k, v]) => {
    if (endpoint.includes(`{${k}}`)) url = url.replace(`{${k}}`, v);
  });
  // Append remaining query params
  const queryParams = Object.fromEntries(Object.entries(params).filter(([k]) => !endpoint.includes(`{${k}}`)));
  url = appendQueryParams(url, queryParams);
  const parsed = parseRequestBody(bodyText);
  const headers = buildHeaders(authType, token);
  const options = { method, headers, body: parsed.ok && parsed.body ? JSON.stringify(parsed.body) : null };
  return { url, options, parsedBody: parsed };
}

module.exports.buildRequest = buildRequest;

module.exports.getStorage = getStorage;

// --- Render helpers (pure functions returning HTML fragments) ---
function buildEndpointOptions(paths, defaultEndpoint) {
  if (!paths) return '';
  return Object.keys(paths).map(p => `<option ${p === defaultEndpoint ? 'selected' : ''}>${p}</option>`).join('');
}

function buildMethodOptions(methods, activeMethod) {
  if (!methods || methods.length === 0) return '';
  return methods.map(m => `<option ${m.toLowerCase() === (activeMethod || '').toLowerCase() ? 'selected' : ''}>${m}</option>`).join('');
}

function buildParamsHtml(parameters) {
  if (!parameters || !Array.isArray(parameters)) return '';
  let out = '';
  parameters.forEach(param => {
    if (param.in === 'query' || param.in === 'path') {
      const t = param.schema?.type === 'integer' ? 'number' : 'text';
      const def = param.schema?.default || '';
      out += `<label>${param.name} (${param.schema?.type || 'text'}):</label>\n            <input type="${t}" name="${param.name}" aria-label="${param.name}" value="${def}" /><br />`;
    }
  });
  return out;
}

function buildBodyHtml(requestBody) {
  if (!requestBody || !requestBody.content || !requestBody.content['application/json']) return '';
  const schema = requestBody.content['application/json'].schema;
  const example = JSON.stringify(schema.example || {}, null, 2);
  const placeholder = JSON.stringify(schema, null, 2);
  let out = `<label>Request Body (JSON):</label>\n        <textarea name="body" aria-label="Request Body" placeholder='${placeholder}'>${example}</textarea><br />`;
  // include a simple representation of nested fields (not editable inputs for complex structures)
  if (schema) out += renderSchemaFieldsHelper(schema);
  return out;
}

function renderAuthHtml(spec, authState = {}) {
  const securitySchemes = spec?.components?.securitySchemes || {};
  const hasBearer = Object.keys(securitySchemes).some(key => securitySchemes[key]?.type === 'http' && securitySchemes[key]?.scheme === 'bearer');
  const defaultAuth = hasBearer ? 'bearer' : 'none';
  const showToken = authState.authType === 'bearer' || defaultAuth === 'bearer';
  const maskedToken = authState.token ? '*'.repeat(authState.token.length) : '';
  return `\n      <details ${defaultAuth === 'bearer' ? 'open' : ''}>\n        <summary>Auth (${defaultAuth})</summary>\n        <select id="auth-type" aria-label="Auth Type">\n          <option value="none">None</option>\n          <option value="bearer" ${defaultAuth === 'bearer' ? 'selected' : ''}>Bearer Token</option>\n        </select>\n        <div id="token-section" style="display:${showToken ? 'block' : 'none'};">\n          <label for="token-input">Token:</label>\n            <input type="password" id="token-input" value="${escapeHtmlHelper(maskedToken)}" placeholder="e.g., ghp_abc123..." aria-describedby="token-help" />\n            <span id="token-badge" class="token-badge" aria-live="polite" style="display:none;margin-left:8px"></span>\n            <button id="save-token">Save</button>\n            <button id="clear-token">Clear</button>\n          <label for="persist-toggle" style="display:inline-block;margin-left:8px;">\n            <input type="checkbox" id="persist-toggle" ${authState.persistToken ? 'checked' : ''} aria-label="Persist token in storage" />\n            Persist Token (Storage)\n          </label>\n          <small id="token-help">Default ephemeral (clears on reload) unless you check Persist Token.</small>\n        </div>\n      </details>\n    `;
}

function buildHistoryOptions(history) {
  if (!history || !Array.isArray(history)) return '';
  return history.map((h, i) => `<option value="${i}">${h.endpoint} [${h.method}]</option>`).join('');
}

function buildDarkToggle(darkMode) {
  return `<button id="dark-toggle" aria-label="Toggle dark mode">${darkMode ? '🌙' : '☀️'}</button>`;
}

module.exports.buildEndpointOptions = buildEndpointOptions;
module.exports.buildMethodOptions = buildMethodOptions;
module.exports.buildParamsHtml = buildParamsHtml;
module.exports.buildBodyHtml = buildBodyHtml;
module.exports.renderAuthHtml = renderAuthHtml;
module.exports.buildHistoryOptions = buildHistoryOptions;
module.exports.buildDarkToggle = buildDarkToggle;

// Build response HTML for display given parsed data/text and status
function buildResponseHtml(rawData, rawText, lastStatus, highlightEnabled = true) {
  const statusLine = lastStatus ? `Status: ${lastStatus}\n` : '';
  if (rawData !== null && typeof rawData !== 'undefined') {
    const jsonStr = JSON.stringify(rawData, null, 2);
    if (highlightEnabled && typeof highlightJSONHelper === 'function') {
      const highlighted = highlightJSONHelper(jsonStr);
      return `<pre><code>${escapeHtmlHelper(statusLine)}${highlighted}</code></pre>`;
    }
    return `<pre><code>${escapeHtmlHelper(statusLine + jsonStr)}</code></pre>`;
  }
  if (rawText) return `<pre><code>${escapeHtmlHelper(statusLine + rawText)}</code></pre>`;
  return `<pre><code>${escapeHtmlHelper(statusLine + '')}</code></pre>`;
}

module.exports.buildResponseHtml = buildResponseHtml;

// Build the full form HTML used by the component. This keeps large markup
// out of the component file so it can be unit-tested separately.
function buildFormHtml(spec, state = {}) {
  const endpointOptions = state.endpointOptions || '';
  const paramsHtml = state.paramsHtml || '';
  const bodyHtml = state.bodyHtml || '';
  const authHtml = state.authHtml || '';
  const historyOptions = state.historyOptions || '';
  const darkToggle = state.darkToggle || '';
  const methods = state.methods || ['GET','POST','PUT','DELETE'];
  const method = state.method || 'get';
  const highlightEnabled = state.highlightEnabled ? 'checked' : '';
  // Note: keep styles here consistent with the component; avoid referencing DOM-specific functions.
  return `
    <style>
      :host { display: block; border: 1px solid #ccc; padding: 1em; font-family: monospace; max-width: 700px; background: var(--qp-bg, #f9f9f9); color: var(--qp-color, #222); }
      select, input, textarea { width: 100%; margin: 0.5em 0; padding: 0.25em; box-sizing: border-box; }
      button { background: #007bff; color: white; border: none; padding: 0.5em 1em; cursor: pointer; margin-right: 0.5em; }
      button:hover { background: #0056b3; }
      #response { background: var(--qp-res-bg, #f8f9fa); padding: 1em; margin-top: 1em; white-space: pre-wrap; border: 1px solid #ddd; max-height: 360px; overflow: auto; font-size:0.9em }
      #response pre{margin:0;}
      #ws-status { font-size: 0.8em; color: green; margin: 0.5em 0; }
      #offline-notice { color: orange; font-size: 0.9em; }
      .json-key { color: #2196F3; }
      .json-string { color: #4CAF50; }
      .json-number { color: #FF9800; }
      .json-boolean { color: #9C27B0; }
      .json-null { color: #607D8B; }
      .json-punctuation { color: #000; }
      :host([dark]) { --qp-bg: #222; --qp-color: #eee; --qp-res-bg: #333; }
      :host([dark]) .json-key { color: #BBDEFB; }
      :host([dark]) .json-string { color: #C8E6C9; }
      :host([dark]) .json-number { color: #FFE0B2; }
      :host([dark]) .json-boolean { color: #E1BEE7; }
      :host([dark]) .json-null { color: #CFD8DC; }
      :host([dark]) .json-punctuation { color: #fff; }
      .copy-btn { background: #28a745; font-size: 0.8em; padding: 0.25em 0.5em; color: #fff; border: none; cursor: pointer; }
      .toggle-group { display:flex; align-items:center; gap:8px; margin:0.25em 0; font-size:0.9em; }
      @media (max-width: 600px) {
        :host { padding: 0.5em; max-width: 100%; }
        select, input, textarea { font-size: 16px; padding: 12px; }
        button { min-height: 44px; min-width: 44px; padding: 12px; font-size: 16px; }
        .toggle-group { flex-direction: column; align-items: flex-start; gap: 8px; }
        #response { max-height: 40vh; font-size: 14px; overflow: auto; white-space: pre-wrap; }
      }
    </style>
    <div style="display:flex;gap:12px;align-items:center;justify-content:space-between">
      <h3 style="margin:0">Test API Endpoint</h3>
      <div>${darkToggle}</div>
    </div>
    <label style="font-size:0.9em">Endpoint</label>
    <select id="endpoint-select" aria-label="Endpoint">${endpointOptions}</select>
    <label style="font-size:0.9em">Method</label>
    <select id="method" aria-label="HTTP Method">${methods.map(m => `<option ${m.toLowerCase() === method ? 'selected' : ''}>${m}</option>`).join('')}</select>
    <div id="params">${paramsHtml}</div>
    ${bodyHtml}
    ${authHtml}
    <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;align-items:center">
      <button id="send-btn">Send Request</button>
      <button id="clear-btn">Clear</button>
      <button id="save-btn">Save Request</button>
      <button id="copy-btn" class="copy-btn">Copy Response</button>
      <div class="toggle-group" style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="highlight-toggle" ${highlightEnabled} aria-label="Toggle syntax highlighting for response" />
        <label for="highlight-toggle">Highlight Response</label>
      </div>
      <select id="history-select" aria-label="Response History"><option value="">History</option>${historyOptions}</select>
    </div>
    <div id="ws-status"></div>
    <div id="offline-notice" style="display:none;">⚠️ Offline: Using cached response</div>
    <div id="response" aria-live="polite"><pre><code>Response will appear here...</code></pre></div>
  `;
}

module.exports.buildFormHtml = buildFormHtml;

// --- Cache / offline helpers ---
function getCachedResponse(storage, endpoint, url, method) {
  if (!storage) return null;
  try {
    const keys = (typeof buildCacheKeys === 'function') ? buildCacheKeys(endpoint, url, method) : [`queryplay:${endpoint}:${method}`, `queryplay:${url}:${method}`];
    for (const k of keys) {
      const v = storage.getItem(k);
      if (v) return v;
    }
  } catch (e) {
    return null;
  }
  return null;
}

function saveCache(storage, endpoint, url, method, value) {
  if (!storage) return false;
  try {
    const keys = (typeof buildCacheKeys === 'function') ? buildCacheKeys(endpoint, url, method) : [`queryplay:${endpoint}:${method}`, `queryplay:${url}:${method}`];
    storage.setItem(keys[0], value);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports.getCachedResponse = getCachedResponse;
module.exports.saveCache = saveCache;

// Convenience wrapper used by the component to get a single cached string
// value for offline use. Tries endpoint key first, then URL key. Returns
// cached string or null. Swallows storage errors.
function getOfflineCached(storage, endpoint, url, method) {
  if (!storage) return null;
  try {
    const keys = (typeof buildCacheKeys === 'function') ? buildCacheKeys(endpoint, url, method) : [`queryplay:${endpoint}:${method}`, `queryplay:${url}:${method}`];
    for (const k of keys) {
      try {
        const v = storage.getItem(k);
        if (v) return v;
      } catch (e) {
        // continue to next key
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}

module.exports.getOfflineCached = getOfflineCached;

// Orchestrate a fetch call: call fetchFn(url, options), parse & cache using parseAndCacheResponse
// Returns an object { rawData, rawText, lastStatus } or { error: 'message' }
async function orchestrateFetch(fetchFn, storage, endpoint, url, method, options) {
  if (typeof fetchFn !== 'function') return { error: 'fetchFn not provided' };
  try {
    const resp = await fetchFn(url, options);
    if (!resp || typeof resp.status === 'undefined') return { error: 'invalid response' };
    if (typeof parseAndCacheResponse === 'function') {
      const parsed = await parseAndCacheResponse(storage, endpoint, url, method, resp);
      return parsed;
    }
    // fallback: simple parse
    const contentType = (resp.headers && typeof resp.headers.get === 'function') ? (resp.headers.get('content-type') || '') : '';
    if (contentType.includes('application/json')) {
      const json = await resp.json();
      const jsonStr = JSON.stringify(json, null, 2);
      if (storage) {
        const keys = (typeof buildCacheKeys === 'function') ? buildCacheKeys(endpoint, url, method) : [`queryplay:${endpoint}:${method}`];
        storage.setItem(keys[0], jsonStr);
      }
      return { rawData: json, rawText: '', lastStatus: resp.status };
    }
    const text = await resp.text();
    const short = text.length > 10000 ? text.slice(0, 10000) + '\n...truncated...' : text;
    if (storage) {
      const keys = (typeof buildCacheKeys === 'function') ? buildCacheKeys(endpoint, url, method) : [`queryplay:${endpoint}:${method}`];
      storage.setItem(keys[0], short);
    }
    return { rawData: null, rawText: short, lastStatus: resp.status };
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

module.exports.orchestrateFetch = orchestrateFetch;

// New: fetch + parse + cache helper. Intended to be synchronous-deterministic
// aside from network I/O; kept pure-ish so unit tests can mock fetchFn and
// storage behaviors.
async function fetchParseAndCache(storage, endpoint, url, method, fetchFn, options = {}) {
  if (typeof fetchFn !== 'function') return { error: 'fetchFn not provided' };
  try {
    const resp = await fetchFn(url, options);
    if (!resp || typeof resp.status === 'undefined') return { error: 'invalid response' };
    const contentType = (resp.headers && typeof resp.headers.get === 'function') ? (resp.headers.get('content-type') || '') : '';
    if (contentType.includes('application/json')) {
      try {
        const json = await resp.json();
        const jsonStr = JSON.stringify(json, null, 2);
        const keys = (typeof buildCacheKeys === 'function') ? buildCacheKeys(endpoint, url, method) : [`queryplay:${endpoint}:${method}`];
        let savedKey = null;
        try {
          if (storage && typeof storage.setItem === 'function') {
            storage.setItem(keys[0], jsonStr);
            savedKey = keys[0];
          }
        } catch (e) {
          // ignore storage errors; savedKey remains null
        }
        return { rawData: json, rawText: '', lastStatus: resp.status, savedKey };
      } catch (e) {
        return { rawData: null, rawText: `Error: ${e.message}`, lastStatus: resp.status };
      }
    }
    // plain text fallback
    try {
      const text = await resp.text();
      const short = text.length > 10000 ? text.slice(0, 10000) + '\n...truncated...' : text;
      const keys = (typeof buildCacheKeys === 'function') ? buildCacheKeys(endpoint, url, method) : [`queryplay:${endpoint}:${method}`];
      let savedKey = null;
      try {
        if (storage && typeof storage.setItem === 'function') {
          storage.setItem(keys[0], short);
          savedKey = keys[0];
        }
      } catch (e) {
        // swallow storage errors
      }
      return { rawData: null, rawText: short, lastStatus: resp.status, savedKey };
    } catch (e) {
      return { rawData: null, rawText: `Error: ${e.message}`, lastStatus: resp.status };
    }
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
}

module.exports.fetchParseAndCache = fetchParseAndCache;

// Collect values from the component's form (shadowRoot). This is deterministic
// DOM traversal that can be unit-tested with a JSDOM shadowRoot.
function collectFormValues(shadowRoot) {
  if (!shadowRoot) return { method: 'GET', endpoint: '', params: {}, bodyText: '' };
  const methodEl = shadowRoot.querySelector('#method');
  const endpointEl = shadowRoot.querySelector('#endpoint-select');
  const method = methodEl ? (methodEl.value || 'GET') : 'GET';
  const endpoint = endpointEl ? (endpointEl.value || '') : '';
  const paramEls = Array.from(shadowRoot.querySelectorAll('input[name]'));
  const params = paramEls.reduce((acc, el) => ({ ...acc, [el.name]: el.value }), {});
  const bodyEl = shadowRoot.querySelector('textarea[name="body"]');
  const bodyText = bodyEl ? (bodyEl.value || '') : '';
  return { method, endpoint, params, bodyText };
}

module.exports.collectFormValues = collectFormValues;

// --- WebSocket helpers ---
function calcReconnectDelay(attempt, base = 1000, cap = 30000) {
  const delay = base * attempt;
  return delay > cap ? cap : delay;
}

function attachWsHandlers(ws, handlers = {}) {
  if (!ws) return false;
  try {
    if (typeof handlers.onopen === 'function') ws.onopen = handlers.onopen;
    if (typeof handlers.onmessage === 'function') ws.onmessage = handlers.onmessage;
    if (typeof handlers.onerror === 'function') ws.onerror = handlers.onerror;
    if (typeof handlers.onclose === 'function') ws.onclose = handlers.onclose;
    return true;
  } catch (e) {
    return false;
  }
}

module.exports.calcReconnectDelay = calcReconnectDelay;
module.exports.attachWsHandlers = attachWsHandlers;

// Build copy text for clipboard from response data/text/status
function buildCopyText(rawData, rawText, lastStatus) {
  let text = '';
  if (lastStatus) text += `Status: ${lastStatus}\n`;
  if (rawData !== null && typeof rawData !== 'undefined') text += JSON.stringify(rawData, null, 2);
  else if (rawText) text += rawText;
  return text;
}

module.exports.buildCopyText = buildCopyText;

// Parse a history entry's output into rawData/rawText
function parseHistoryEntry(entry) {
  if (!entry) return { rawData: null, rawText: '' };
  const out = entry.output;
  if (typeof out === 'string') {
    try {
      const json = JSON.parse(out);
      return { rawData: json, rawText: '' };
    } catch (e) {
      return { rawData: null, rawText: out };
    }
  }
  // object-like
  return { rawData: out, rawText: '' };
}

module.exports.parseHistoryEntry = parseHistoryEntry;

// Limit history array to max length
function limitHistory(historyArr, entry, max = 10) {
  const h = historyArr ? historyArr.slice() : [];
  h.push(entry);
  while (h.length > max) h.shift();
  return h;
}

// Format fetch/network error for UI
function formatFetchError(err) {
  if (!err) return 'Unknown error';
  return `Error: ${err.message || String(err)} (Check CORS?)`;
}

module.exports.limitHistory = limitHistory;
module.exports.formatFetchError = formatFetchError;

// Attach to globalThis for browser usage when loaded as a script
if (typeof globalThis !== 'undefined') {
  globalThis.__qp_helpers = module.exports;
}
