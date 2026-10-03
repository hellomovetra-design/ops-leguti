const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
function load(file, imports, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => imports[name] || {}, crypto: webcrypto,
    process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'test' } }, performance, ...globals });
  return exports;
}
(async () => {
  const calls = [];
  let session = { email: 'user@example.com', role: 'viewer' }, error = null;
  const message = { id: 'saved', seq: 1, thread_id: '11111111-1111-1111-1111-111111111111', body: 'hello', client_id: '22222222-2222-2222-2222-222222222222' };
  const route = load('app/api/inbox/route.ts', {
    'next/server': { after: () => {}, NextResponse: { json: (body, init) => ({ body, status: init.status, headers: new Headers(init.headers) }) } },
    '@/lib/auth-token': { SESSION_COOKIE: 'session', verifySessionToken: async () => session },
    '@/lib/supabase': { getSupabaseServerClient: () => ({
      from: () => { throw new Error('send must not use extra DB lookups'); },
      rpc: async (name, args) => { calls.push({ name, args }); return { data: message, error }; },
    }) },
    '@/lib/inbox': { INBOX_ADMIN_ROLES: ['admin', 'super_admin'] },
  });
  const request = (scope = 'user', body = 'hello', origin = 'http://localhost') => ({
    headers: new Headers({ origin }), nextUrl: new URL('http://localhost/api/inbox'), cookies: { get: () => undefined },
    json: async () => ({ action: 'send', scope, body, thread_id: message.thread_id, client_id: message.client_id }),
  });
  assert.equal((await route.POST(request('admin'))).status, 403);
  assert.equal((await route.POST(request('user', 'hello', 'https://attacker.test'))).status, 403);
  assert.equal((await route.POST(request('user', ''))).status, 400);
  assert.equal(calls.length, 0);
  const response = await route.POST(request());
  assert.equal(response.status, 200); assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'ops_inbox_send_fast');
  assert.equal(calls[0].args.p_admin, false);
  assert.equal(calls[0].args.p_email, session.email);
  assert.match(response.headers.get('Server-Timing'), /^db;dur=/);
  error = { code: 'P0002' }; assert.equal((await route.POST(request())).status, 404);
  error = { code: 'other' }; assert.equal((await route.POST(request())).status, 503);

  let states = [], refs = [], position = 0, refPosition = 0, pendingResolve;
  const react = {
    useState: initial => { const index = position++; if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useRef: initial => { const index = refPosition++; return refs[index] ||= { current: initial }; },
    useCallback: callback => callback, useEffect: () => {},
  };
  const hook = load('components/use-inbox.ts', { react }, {
    fetch: (url, options) => options?.method === 'POST' ? new Promise(resolve => { pendingResolve = resolve; }) :
      Promise.resolve({ ok: true, json: async () => ({ items: [], email: session.email, messages: [message] }) }),
  });
  const render = () => { position = refPosition = 0; return hook.useInbox({ threadId: message.thread_id }); };
  let model = render(); const sending = model.send('hello');
  model = render(); assert.equal(model.pendingMessage.pending, true); assert.equal(model.sending, true);
  pendingResolve({ ok: true, json: async () => ({ message }) }); await sending;
  model = render(); assert.equal(model.pendingMessage, null); assert.equal(model.sending, false);
  assert.equal(model.messages.filter(item => item.id === message.id).length, 1);
  const failed = model.send('retry');
  pendingResolve({ ok: false, json: async () => ({ error: 'connection failed' }) });
  assert.equal(await failed, false);
  model = render(); assert.equal(model.pendingMessage, null); assert.equal(model.error, 'connection failed');
  console.log('PASS: one DB call, auth/origin/validation, errors, timing, immediate pending, confirmation, failure');
})().catch(error => { console.error(error); process.exitCode = 1; });
