// Netlify Function to proxy /api/* requests to a real API
// Usage: set PROXY_TARGET env var to the upstream base URL, e.g. https://api.example.com
// Optionally set API_SECRET to include as Authorization: Bearer <API_SECRET>

exports.handler = async function (event, context) {
  const proxyBase = process.env.PROXY_TARGET;
  if (!proxyBase) {
    return { statusCode: 500, body: 'PROXY_TARGET is not configured on server' };
  }

  try {
    // event.path looks like /api/whatever
    const pathSuffix = event.path.replace(/^\/api/, '') || '/';
    const qs = event.rawQueryString ? `?${event.rawQueryString}` : '';
    const target = proxyBase.endsWith('/') && pathSuffix.startsWith('/') ? proxyBase.slice(0, -1) + pathSuffix + qs : proxyBase + pathSuffix + qs;

    const method = event.httpMethod || 'GET';
    // clone headers but remove host/origin to avoid upstream issues
    const headers = Object.assign({}, event.headers || {});
    delete headers.host;
    delete headers.origin;

    // Optionally inject API secret stored as environment variable
    if (process.env.API_SECRET) {
      headers['authorization'] = `Bearer ${process.env.API_SECRET}`;
    }

    const body = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : (event.body || null);

    const resp = await fetch(target, { method, headers, body, redirect: 'manual' });

    const respText = await resp.text();
    const outHeaders = {};
    // copy a couple of useful headers (content-type); avoid hop-by-hop headers
    const ct = resp.headers.get('content-type');
    if (ct) outHeaders['content-type'] = ct;

    return { statusCode: resp.status, headers: outHeaders, body: respText };
  } catch (err) {
    return { statusCode: 500, body: String(err) };
  }
};
