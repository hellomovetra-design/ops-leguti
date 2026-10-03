const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: name => imports[name] || {}, process: { env: {} }, ...globals });
  return exports;
}
(async () => {
  const id = '11111111-1111-1111-1111-111111111111';
  let session = { email: 'User@Example.com' }, operations = [], error = null;
  const query = {
    delete() { operations.push(['delete']); return this; },
    update(value) { operations.push(['update', value]); return this; },
    eq(...args) { operations.push(['eq', ...args]); return this; },
    is(...args) { operations.push(['is', ...args]); return this; },
    select() { return Promise.resolve({ data: [{ id }], error }); },
  };
  const api = load('app/api/notifications/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init.status }) } },
    '@/lib/auth-token': { verifySessionToken: async () => session },
    '@/lib/supabase': { getSupabaseServerClient: () => ({ from: name => { assert.equal(name, 'ops_notifications'); return query; } }) },
  });
  const request = (action, noticeId = id, origin = 'http://localhost') => ({
    nextUrl: new URL('http://localhost/api/notifications'), headers: new Headers({ origin }),
    cookies: { get: () => undefined }, json: async () => ({ action, ...(noticeId ? { id: noticeId } : {}) }),
  });
  assert.equal((await api.POST(request('delete', null))).status, 400);
  assert.equal((await api.POST(request('delete', 'bad'))).status, 400);
  assert.equal((await api.POST(request('delete', id, 'https://evil.test'))).status, 403);
  assert.equal(operations.length, 0);
  assert.equal((await api.POST(request('delete'))).status, 200);
  assert.deepEqual(operations, [['delete'], ['eq', 'id', id], ['eq', 'recipient_email', 'user@example.com']]);
  operations = []; await api.POST(request('read'));
  assert.equal(operations[0][0], 'update'); assert.equal(operations.some(x => x[0] === 'delete'), false);
  error = {}; assert.equal((await api.POST(request('delete'))).status, 503);
  session = null; assert.equal((await api.POST(request('delete'))).status, 401);

  let states = [], refs = [], position = 0, refPosition = 0, items = [{ id, title: 'Existing', read_at: null }], confirmed = false;
  const react = {
    useState: initial => { const index = position++; if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useRef: initial => { const index = refPosition++; return refs[index] ||= { current: initial }; },
    useCallback: callback => callback, useEffect: () => {},
  };
  const hook = load('components/pwa-notifications.tsx', { react }, {
    window: { confirm: () => confirmed },
    fetch: async (url, options) => {
      if (options?.method === 'POST') {
        const body = JSON.parse(options.body);
        if (body.action === 'delete') items = items.filter(x => x.id !== body.id);
        return { ok: true, json: async () => ({ ok: true, ids: [body.id] }) };
      }
      return { ok: true, json: async () => ({ items: [...items], unread: items.filter(x => !x.read_at).length }) };
    },
  });
  const render = () => { position = refPosition = 0; return hook.usePwaNotifications(); };
  let model = render(); await model.refresh(); model = render();
  assert.equal(model.items.length, 1);
  await model.remove(model.items[0]); model = render(); assert.equal(model.items.length, 1); // cancelled
  confirmed = true; await model.remove(model.items[0]); model = render();
  assert.equal(model.items.length, 0); assert.equal(model.unread, 0);
  await model.refresh(); model = render(); assert.equal(model.items.length, 0);
  items = [{ id: 'other', title: 'Retained', read_at: 'already-read' }]; await model.refresh(); model = render();
  assert.equal(model.items.length, 1); // read notices remain
  items = []; await model.refresh(); model = render(); assert.equal(model.items.length, 0); // another device deleted it
  console.log('PASS: scoped deletion, origin/auth/validation, read retention, confirmation, persistent deletion, cross-device refresh');
})().catch(error => { console.error(error); process.exitCode = 1; });
