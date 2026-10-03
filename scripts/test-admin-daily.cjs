const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => imports[name] || {}, process: { env: {} }, URL, File });
  return exports;
}
(async () => {
  const id = '11111111-1111-1111-1111-111111111111';
  let session = { email: 'user@example.com', role: 'viewer' }, calls = [];
  const record = { id, created_by: 'user@example.com', photos: [], status: 'open', updated_at: '2026-10-03T04:00:00Z' };
  let result = { data: [record], error: null, count: 1 };
  const query = { then(resolve, reject) { return Promise.resolve(result).then(resolve,reject); } };
  for (const name of ['select','eq','order','range','limit','gte','lte','ilike','update']) query[name] = (...args) => { calls.push([name,...args]); return query; };
  query.maybeSingle = async () => ({ ...result, data: Array.isArray(result.data) ? result.data[0] : result.data });
  const constants = load('lib/problem-solving-daily.ts', {});
  const route = load('app/api/problem-solving-daily/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init.status }) } },
    '@/lib/auth-token': { verifySessionToken: async () => session },
    '@/lib/supabase': { getSupabaseServerClient: () => ({ from: name => { calls.push(['from',name]); return query; } }) },
    '@/lib/problem-solving-daily': constants,
  });
  const request = (params='', action='review', changes={}, origin='http://localhost') => ({
    nextUrl: new URL(`http://localhost/api/problem-solving-daily?${params}`),
    cookies: { get: () => undefined }, headers: new Headers({ origin }),
    formData: async () => { const form = new FormData(); Object.entries({ action, id, status: 'in_progress', solution: 'Sedang ditangani', updated_at: record.updated_at, ...changes }).forEach(([key,value])=>form.append(key,value)); return form; },
  });
  assert.equal((await route.GET(request('scope=admin'))).status,403);
  assert.equal((await route.POST(request())).status,403);
  calls=[]; assert.equal((await route.GET(request())).status,200);
  assert.ok(calls.some(call=>call[0]==='eq'&&call[1]==='created_by'&&call[2]===session.email));
  session.role='admin'; calls=[];
  const feed = await route.GET(request('scope=admin&status=open&offset=25'));
  assert.equal(feed.status,200); assert.equal(feed.body.total,1);
  assert.ok(calls.some(call=>call[0]==='range'&&call[1]===25&&call[2]===49));
  assert.equal((await route.GET(request('scope=admin&from=2026-02-31'))).status,400);
  assert.equal((await route.GET(request('scope=admin&from=2026-10-04&to=2026-10-03'))).status,400);
  assert.equal((await route.POST(request('', 'review', {}, 'https://evil.test'))).status,403);
  assert.equal((await route.POST(request('', 'review', {status:'constructor'}))).status,400);
  calls=[]; const saved = await route.POST(request()); assert.equal(saved.status,200);
  assert.ok(calls.some(call=>call[0]==='eq'&&call[1]==='updated_at'&&call[2]===record.updated_at));
  const update = calls.find(call=>call[0]==='update')[1];
  assert.equal(update.updated_by,session.email); assert.equal(update.solution,'Sedang ditangani');
  assert.equal(Object.hasOwn(update,'created_by'),false);
  result.data=null; assert.equal((await route.POST(request())).status,409);
  result.error={code:'42P01'}; assert.equal((await route.GET(request('scope=admin'))).status,503);
  session=null; assert.equal((await route.GET(request())).status,401);
  console.log('PASS: admin access, owner scope, filters, pagination, origin, review, concurrency, migration error');
})().catch(error=>{console.error(error);process.exitCode=1;});
