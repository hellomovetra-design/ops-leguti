const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
function load(file, mocks = {}) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    module: m, exports: m.exports, require: n => mocks[n] || (n.startsWith('@/') ? {} : require(n)), process: { env: {} }, console, URL, Date, Buffer,
  });
  return m.exports;
}
const policy = load('lib/history-scope.ts');
let session;
const owner = 'owner@example.test', other = 'other@example.test';
const rows = [owner, other].map((email, i) => ({ id: `11111111-1111-4111-8111-11111111111${i}`, created_by: email, created_by_email: email, created_at: '2026-10-07T01:00:00Z', archived_at: null, status: 'open', photos: [] }));
const db = { from(table) {
  const filters = []; let bounds = [0, 999];
  const q = { select() { return q; }, order() { return q; }, limit() { return q; }, eq(k,v) { filters.push(r => r[k] === v); return q; }, neq(k,v) { filters.push(r => r[k] !== v); return q; }, is(k,v) { filters.push(r => r[k] === v); return q; }, in() { return q; }, range(a,b) { bounds = [a,b]; return q; }, then(resolve, reject) {
    const data = ['ops_requests', 'ops_problems', 'ops_courier_checks', 'ops_problem_solving_daily'].includes(table) ? rows.filter(r => filters.every(f => f(r))).slice(bounds[0], bounds[1]+1) : [];
    return Promise.resolve({ data, error: null, count: data.length }).then(resolve, reject);
  } }; return q;
} };
const mocks = {
  '@/lib/history-scope': policy,
  '@/lib/supabase': { getSupabaseServerClient: () => db },
  '@/lib/auth-token': { SESSION_COOKIE: 'jne_session', verifySessionToken: async () => session },
  '@/lib/request-report': load('lib/request-report.ts'),
  '@/lib/problem-records': load('lib/problem-records.ts'),
  '@/lib/problem-solving-daily': load('lib/problem-solving-daily.ts'),
};
const ops = load('app/api/ops-desk/route.ts', mocks);
const carry = load('app/api/courier-checks/route.ts', mocks);
const daily = load('app/api/problem-solving-daily/route.ts', mocks);
const endpoints = [[ops, '/api/ops-desk?type=problems'], [ops, '/api/ops-desk?type=requests'], [carry, '/api/courier-checks?'], [daily, '/api/problem-solving-daily?']];
(async () => {
  for (const [api, path] of endpoints) {
    for (const role of ['viewer', 'admin', 'super_admin', 'coordinator', 'spv', 'jr_spv']) {
      session = { email: owner, role };
      const personal = await api.GET(new NextRequest('http://localhost' + path + '&scope=mine&email=' + other));
      assert.equal(personal.status, 200, path);
      assert.equal(personal.headers.get('cache-control'), 'no-store');
      const items = (await personal.json()).items;
      assert.equal(items.length, 1, path + ' ' + role); assert.equal(items[0].created_by, owner);
      const normal = await api.GET(new NextRequest('http://localhost' + path));
      assert.equal((await normal.json()).items.length, role === 'viewer' ? 1 : 2, path + ' dashboard ' + role);
    }
    session = { email: 'empty@example.test', role: 'admin' };
    assert.equal((await (await api.GET(new NextRequest('http://localhost' + path + '&scope=mine'))).json()).items.length, 0);
    session = null;
    assert.equal((await api.GET(new NextRequest('http://localhost' + path + '&scope=mine'))).status, 401);
  }
  console.log('PASS: all four PWA histories isolate account ownership across six roles, ignore supplied email, keep admin lists global, and handle empty/unauthenticated sessions.');
})().catch(e => { console.error(e); process.exitCode = 1; });
