// Small runtime utility helpers extracted from runtime.js to make logic testable.

function minimalBuild(apiSpec = {}, endpoint = '', method = 'GET', params = {}, bodyText = '', authType = 'none', token = '', helpers = null) {
  const serverUrl = apiSpec?.servers?.[0]?.url || '';
  let url = serverUrl;
  if (serverUrl.endsWith('/') && endpoint.startsWith('/')) url = serverUrl.slice(0, -1) + endpoint;
  else url = serverUrl + endpoint;

  // allow helpers to parse request body if provided (for backwards compatibility)
  const parsedBody = (helpers && typeof helpers.parseRequestBody === 'function') ? helpers.parseRequestBody(bodyText) : { ok: true, body: null };
  const headers = (helpers && typeof helpers.buildHeaders === 'function') ? helpers.buildHeaders(authType, token) : { 'Content-Type': 'application/json' };
  const options = { method, headers };
  if (parsedBody && parsedBody.ok && parsedBody.body) options.body = JSON.stringify(parsedBody.body);
  return { url, options, parsedBody };
}

async function fallbackParseResponse(storage, endpoint, url, method, resp) {
  // resp: { status, headers, json(), text() }
  const contentType = (resp.headers && typeof resp.headers.get === 'function') ? (resp.headers.get('content-type') || '') : '';
  if (contentType.includes('application/json')) {
    const json = await resp.json();
    const jsonStr = JSON.stringify(json, null, 2);
    // allow storage errors to bubble to caller so they can be handled centrally
    if (storage) storage.setItem(`queryplay:${endpoint}:${method}`, jsonStr);
    return { rawData: json, rawText: '', lastStatus: resp.status };
  }
  const text = await resp.text();
  const short = text.length > 10000 ? text.slice(0, 10000) + '\n...truncated...' : text;
  if (storage) storage.setItem(`queryplay:${endpoint}:${method}`, short);
  return { rawData: null, rawText: short, lastStatus: resp.status };
}

module.exports = { minimalBuild, fallbackParseResponse };
