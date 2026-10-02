const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
let session = { email: 'admin@example.test', role: 'admin' }, failure = '';
const employees = Array.from({ length: 1002 }, (_, i) => ({ nik: String(i), name: `Person ${i}`, active: true }));
const db = { from(table) {
  let range = [0, 999], niks = [];
  const query = { select() { return query; }, order() { return query; }, range(a, b) { range = [a, b]; return query; }, in(_key, values) { niks = values; return query; }, then(resolve, reject) {
    return Promise.resolve(failure === table ? { error: { message: 'test error' } } : { data: table === 'ops_employees' ? employees.slice(range[0], range[1] + 1) : niks.includes('0') ? [{ nik: '0', storage_path: 'imagekit:employees/0/photo.jpg' }] : [], error: null }).then(resolve, reject);
  } }; return query;
} };
const m = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/ops-desk/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { module: m, exports: m.exports, require: name => name === '@/lib/supabase' ? { getSupabaseServerClient: () => db } : name === '@/lib/auth-token' ? { verifySessionToken: async () => session, SESSION_COOKIE: 'jne_session' } : name.startsWith('@/') ? {} : require(name), process: { env: {} }, console });
const get = () => m.exports.GET(new NextRequest('http://localhost/api/ops-desk?type=employees&view=structure'));
(async () => {
  let response = await get(), data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.items.length, 1002);
  assert.equal(data.items[1001].photo_url, '/default-employee.jpg');
  assert.ok(data.items[0].photo_url.startsWith('/api/ops-desk?type=employee-photo&path='));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  failure = 'ops_employees'; assert.equal((await get()).status, 503);
  failure = 'ops_employee_photos'; assert.equal((await get()).status, 503);
  session = null; assert.equal((await get()).status, 401);
  console.log('PASS: paginated structure includes 1002 employees, same-origin photos/default, no-store, auth and explicit database/photo errors.');
})().catch(error => { console.error(error); process.exitCode = 1; });
