// Isolated regression tests: no connection to live Auth or database.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), ts = require('typescript');
const { NextRequest } = require('next/server');
function load(file, mocks, env = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { exports: module.exports, module, require: name => mocks[name] || require(name), process: { env }, crypto: globalThis.crypto, TextEncoder, TextDecoder, Uint8Array, btoa, atob, Buffer, URL, Date, Response, console });
  return module.exports;
}
const definitions = load('lib/courier-checks.ts', {});
const access = load('lib/employee-access.ts', { '@/lib/supabase': {}, '@/lib/auth-token': {}, '@/lib/courier-checks': definitions });
const employee = (nik, name, position, superior = '', hub = 'SPC LEGUTI') => ({ nik, name, position, superior, hub, active: true, employment: 'Tetap' });
const rows = [employee('1', 'Koordinator', 'Koordinator'), employee('2', 'Leader A', 'Leader', 'Koordinator'), employee('3', 'Kurir A', 'Kurir Motor Staff', 'Leader A'), employee('4', 'Leader B', 'Leader'), employee('5', 'Kurir B', 'Kurir Mobil Staff', 'Leader B'), employee('6', 'Nonaktif', 'Kurir Motor', 'Leader A')];
rows[5].active = false;
assert.deepEqual(Array.from(access.structuralCouriers(rows, '1'), row => row.nik), ['2', '3']);
assert.deepEqual(Array.from(access.structuralCouriers(rows, '2'), row => row.nik), ['3']);
assert.deepEqual(Array.from(access.structuralCouriers(rows, '', true), row => row.nik), ['2', '3', '4', '5']);
assert.throws(() => access.structuralCouriers(rows, ''), /belum dikaitkan/);
assert.throws(() => access.structuralCouriers([...rows, employee('7', 'Leader A', 'Leader')], '1'), /ganda/);
assert.equal(definitions.deliveryArea('unknown'), '');
const cyclic = [...rows, employee('8', 'Child cycle', 'Leader', 'Kurir A')];
cyclic[0] = { ...rows[0], superior: 'Child cycle' };
assert.equal(access.structuralCouriers(cyclic, '1').length, 3);
let mapping = { email: 'staff@test.example', employee_nik: '00123' }, active = true, authRole = 'viewer', authCalls = 0, lastEmail;
const db = { from(table) { const query = { select() { return query; }, eq() { return query; }, async maybeSingle() { return { data: table === 'ops_user_employee_links' ? mapping : { nik: '00123', active }, error: null }; } }; return query; } };
const env = { NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://example.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test', INTERNAL_AUTH_SECRET: 'x'.repeat(40), INTERNAL_SUPER_ADMIN_EMAIL: 'super@test.example' };
const tokens = load('lib/auth-token.ts', {});
const login = load('app/api/auth/login/route.ts', { '@/lib/auth-token': tokens, '@/lib/supabase': { getSupabaseServerClient: () => db }, '@supabase/supabase-js': { createClient: () => ({ auth: { async signInWithPassword({ email, password }) { authCalls++; lastEmail = email; return password === 'password123' ? { data: { user: { app_metadata: { role: authRole } } } } : { error: {}, data: {} }; } } }) } }, env);
let ip = 0;
async function sign(identifier, password = 'password123', sameIp) { return login.POST(new NextRequest('http://localhost/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': sameIp || String(++ip) }, body: JSON.stringify({ identifier, password }) })); }
(async () => {
  let response = await sign('00123'); assert.equal(response.status, 200); assert.equal(lastEmail, 'staff@test.example');
  let cookie = response.cookies.get(tokens.SESSION_COOKIE).value;
  const session = await tokens.verifySessionToken(cookie, env.INTERNAL_AUTH_SECRET); assert.equal(session.employee_nik, '00123'); assert.equal(session.role, 'viewer');
  assert.equal((await sign('staff@test.example')).status, 401);
  active = false; const before = authCalls; assert.equal((await sign('00123')).status, 401); assert.equal(authCalls, before); active = true;
  mapping = null; assert.equal((await sign('missing')).status, 401); mapping = { email: 'staff@test.example', employee_nik: '00123' };
  assert.equal((await sign('00123', 'wrongpass')).status, 401);
  authRole = 'super_admin'; assert.equal((await sign('00123')).status, 401);
  response = await sign('super@test.example'); assert.equal(response.status, 200);
  cookie = response.cookies.get(tokens.SESSION_COOKIE).value; assert.equal((await tokens.verifySessionToken(cookie, env.INTERNAL_AUTH_SECRET)).employee_nik, undefined);
  for (let i = 0; i < 5; i++) assert.equal((await sign('missing', 'wrongpass', 'ratelimit')).status, 401);
  assert.equal((await sign('missing', 'wrongpass', 'ratelimit')).status, 429);
  console.log('PASS: NIK + password, Super Admin email, inactive/unlinked denial, role preservation, rate limit, hierarchy, duplicates, cycles, unknown area.');
})().catch(error => { console.error(error); process.exitCode = 1; });
