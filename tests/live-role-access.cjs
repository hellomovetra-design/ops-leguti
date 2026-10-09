// No live database writes: verify old signed cookies against mocked current roles.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
const env={NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'server-test-key',INTERNAL_AUTH_SECRET:'x'.repeat(40),INTERNAL_SUPER_ADMIN_EMAIL:'primary@example.test'};
let records=[{role:'viewer'}],unavailable=false,calls=0;
function load(file,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||require(n),process:{env},crypto:globalThis.crypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,Date,URL,AbortSignal,fetch:async(url,options)=>{calls++;assert.equal(options.cache,'no-store');assert.equal(new URL(url).searchParams.get('email'),'eq.staff@example.test');assert.equal(options.headers.apikey,'server-test-key');return{ok:!unavailable,json:async()=>records};}});return m.exports;}
const tokens=load('lib/auth-token.ts'),policy=load('lib/access-policy.ts');
for(const [file,key] of [['lib/damage-case.ts','DAMAGE_ADMINS'],['lib/inbox.ts','INBOX_ADMIN_ROLES'],['lib/problem-solving-daily.ts','DAILY_ADMIN_ROLES']]){
 const roles=load(file)[key];
 for(const role of ['super_admin','admin','spv'])assert.ok(roles.includes(role));
 assert.equal(roles.includes('viewer'),false);
}
const db={from(){return{select(){return this},limit:async()=>({data:[],error:null})}},rpc:async()=>({data:{courier_synced:false},error:null})};
const api=load('app/api/ops-desk/route.ts',{'@/lib/auth-token':tokens,'@/lib/supabase':{getSupabaseServerClient:()=>db},'@/lib/employee-edit':{employeeEditPayload:body=>body},'@/lib/imagekit':{},'@/lib/request-report':{},'@/lib/problem-records':{},'@/lib/employee-access':{},'@/lib/web-push':{},'@/lib/history-scope':{},'@/lib/employee-status':{}});
(async()=>{
 const cookie=await tokens.createSessionToken('staff@example.test','viewer',env.INTERNAL_AUTH_SECRET,'00123');
 for(const role of ['super_admin','spv','admin']){
  records=[{role}];const session=await tokens.verifySessionToken(cookie,env.INTERNAL_AUTH_SECRET);
  assert.equal(session.role,role);assert.equal(session.employee_nik,'00123');
  assert.equal(policy.canOpenRoute(session.role,'/master/employees'),true);
  const result=await api.POST(new NextRequest('http://localhost/api/ops-desk',{method:'POST',headers:{cookie:`jne_session=${cookie}`,'content-type':'application/json'},body:JSON.stringify({action:'updateEmployee',nik:'00123',name:'Test'})}));
  assert.equal(result.status,200,role+' can edit employee');
 }
 const oldAdminCookie=await tokens.createSessionToken('staff@example.test','super_admin',env.INTERNAL_AUTH_SECRET,'00123');
 records=[{role:'viewer'}];assert.equal((await tokens.verifySessionToken(oldAdminCookie,env.INTERNAL_AUTH_SECRET)).role,'viewer');
 const denied=await api.POST(new NextRequest('http://localhost/api/ops-desk',{method:'POST',headers:{cookie:`jne_session=${oldAdminCookie}`,'content-type':'application/json'},body:JSON.stringify({action:'updateEmployee',nik:'00123',name:'Test'})}));assert.equal(denied.status,403);
 unavailable=true;assert.equal(await tokens.verifySessionToken(cookie,env.INTERNAL_AUTH_SECRET),null);unavailable=false;
 records=[];assert.equal(await tokens.verifySessionToken(cookie,env.INTERNAL_AUTH_SECRET),null);
 records=[{role:'unknown'}];assert.equal(await tokens.verifySessionToken(cookie,env.INTERNAL_AUTH_SECRET),null);
 const before=calls;assert.equal(await tokens.verifySessionToken(cookie+'bad',env.INTERNAL_AUTH_SECRET),null);assert.equal(calls,before);
 console.log('PASS: existing cookie promotion, immediate demotion, all three full-access roles can save employee, viewer denied, fail-closed and signature verification before lookup.');
})().catch(e=>{console.error(e);process.exitCode=1});
