const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
function load(file,mocks={}) {const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||require(n),URL,process:{env:{NODE_ENV:'production'}}});return m.exports;}
const policy=load('lib/access-policy.ts');
for(const path of ['/dashboard','/dashboard/ops-desk','/master/structure','/reports/upload','/settings/ops-access','/public/example']){
  assert.equal(policy.canOpenRoute('viewer',path),false);
  assert.equal(policy.loginDestination('viewer',path),'/pwa');
}
for(const path of ['/pwa','/pwa?view=notifications','/pwa/account'])assert.equal(policy.loginDestination('viewer',path),path);
for(const path of ['//evil.test','/\\evil.test','https://evil.test','/login','/api/auth/logout','/dashboard/../../login','/%2f%2fevil.test'])assert.equal(policy.loginDestination('admin',path),'/dashboard');
assert.equal(policy.loginDestination('admin','/pwa'),'/pwa');
assert.equal(policy.loginDestination('admin','/settings/ops-access'),'/settings/ops-access');
for(const role of ['admin','spv','super_admin'])for(const path of ['/dashboard','/master/employees','/master/personnel-changes','/settings/ops-access','/pwa'])assert.equal(policy.canOpenRoute(role,path),true);
assert.equal(policy.loginDestination('super_admin','/settings/ops-access'),'/settings/ops-access');
let session={role:'viewer',email:'staff@test.example'};
const mw=load('middleware.ts',{'@/lib/access-policy':policy,'@/lib/auth-token':{SESSION_COOKIE:'jne_session',verifySessionToken:async()=>session}});
const request=path=>mw.middleware(new NextRequest('https://ops.movetra.id'+path));
(async()=>{
 for(const path of ['/dashboard','/master/structure','/settings/ops-access','/login','/login?next=%2Fdashboard']){
  const r=await request(path);assert.equal(r.status,307);assert.equal(r.headers.get('location'),'https://ops.movetra.id/pwa');assert.match(r.headers.get('cache-control'),/no-store/);
 }
 assert.equal((await request('/pwa')).headers.get('x-middleware-next'),'1');
 session=null;let r=await request('/pwa?view=notifications');assert.equal(new URL(r.headers.get('location')).searchParams.get('next'),'/pwa?view=notifications');
 session={role:'admin',email:'admin@test.example'};assert.equal((await request('/dashboard')).headers.get('x-middleware-next'),'1');assert.equal((await request('/login?next=%2Fpwa')).headers.get('location'),'https://ops.movetra.id/pwa');
 assert.equal((await request('/settings/ops-access')).headers.get('x-middleware-next'),'1');
 session={role:'super_admin',email:'super@test.example'};assert.equal((await request('/settings/ops-access')).headers.get('x-middleware-next'),'1');
 console.log('PASS: PWA-only staff redirects, existing session, old dashboard links, safe next, admin permissions and no-store.');
})().catch(e=>{console.error(e);process.exitCode=1;});
