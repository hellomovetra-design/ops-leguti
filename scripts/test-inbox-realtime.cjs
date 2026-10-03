const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');

function load(file, imports, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => imports[name] || {}, Response, ReadableStream,
    TextEncoder, crypto: webcrypto, process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'test-only' } },
    setInterval, clearInterval, setTimeout, clearTimeout, ...globals });
  return exports;
}

(async () => {
  let session = null, removed = 0, subscribed, changes = [];
  const channel = { on(type, config, callback) { changes.push({ config, callback }); return this; },
    subscribe(callback) { subscribed = callback; return this; } };
  const route = load('app/api/inbox/events/route.ts', {
    '@/lib/auth-token': { SESSION_COOKIE: 'jne_session', verifySessionToken: async () => session },
    '@/lib/supabase': { getSupabaseServerClient: () => ({ channel: () => channel, removeChannel: async () => { removed++; } }) },
    '@/lib/inbox': { INBOX_ADMIN_ROLES: ['admin', 'super_admin'] },
  });
  function request(scope) { return { cookies: { get: () => undefined },
    nextUrl: new URL(`http://localhost/api/inbox/events?scope=${scope}`), signal: new AbortController().signal }; }
  assert.equal((await route.GET(request('user'))).status, 401);
  session = { email: 'User@Example.com', role: 'viewer', exp: Math.floor(Date.now() / 1000) + 600 };
  assert.equal((await route.GET(request('admin'))).status, 403);
  assert.equal((await route.GET(request('invalid'))).status, 400);
  const response = await route.GET(request('user'));
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  assert.equal(changes[0].config.filter, 'owner_email=eq.user@example.com');
  assert.equal(changes[1].config.filter, 'email=eq.user@example.com');
  const reader = response.body.getReader();
  await reader.read(); // reconnect instruction
  subscribed('SUBSCRIBED');
  assert.match(new TextDecoder().decode((await reader.read()).value), /event: change/);
  changes[0].callback({ new: { body: 'private message must not leak' } });
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'event: change\ndata: {}\n\n');
  await reader.cancel(); assert.equal(removed, 1);
  session.role = 'admin'; changes = [];
  const adminResponse = await route.GET(request('admin'));
  assert.equal(changes[0].config.filter, undefined);
  await adminResponse.body.cancel();

  let created = 0, closed = 0;
  const handlers = new Map();
  const sources = [];
  const document = { visibilityState: 'visible',
    addEventListener: (name, handler) => handlers.set(name, handler),
    removeEventListener: name => handlers.delete(name) };
  class EventSource {
    constructor(url) { this.url = url; created++; sources.push(this); }
    addEventListener(name, handler) { this.handler = handler; }
    close() { closed++; }
  }
  const client = load('components/inbox-realtime.ts', {}, { document, EventSource });
  let notified = 0;
  const stopOne = client.subscribeInboxRealtime(false, () => notified++);
  const stopTwo = client.subscribeInboxRealtime(false, () => notified++);
  assert.equal(created, 1);
  sources[0].handler(); sources[0].handler();
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(notified, 2);
  document.visibilityState = 'hidden'; handlers.get('visibilitychange')();
  assert.equal(closed, 1);
  document.visibilityState = 'visible'; handlers.get('visibilitychange')();
  assert.equal(created, 2);
  stopOne(); assert.equal(closed, 1);
  stopTwo(); assert.equal(closed, 2); assert.equal(handlers.size, 0);
  console.log('PASS: auth, scope isolation, payload privacy, cleanup, shared connection, coalescing, background/resume');
})().catch(error => { console.error(error); process.exitCode = 1; });
