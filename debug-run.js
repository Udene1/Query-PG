const runtime = require('./lib/runtime.js');

(async () => {
  const store = { setItem: () => { throw new Error('disk full'); }, getItem: () => null };
  const fakeFetch = async () => ({ status: 200, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) });
  let gotError = null;
  const res = await runtime.orchestrateRequest({ apiSpec: { servers: [{ url: 'http://api' }] }, endpoint: '/s', method: 'GET', fetchFn: fakeFetch, storage: store, onResult: () => {}, onError: (e) => { gotError = e; } });
  console.log('gotError:', gotError);
  console.log('res:', res);
})();
