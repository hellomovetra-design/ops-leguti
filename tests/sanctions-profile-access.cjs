const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
function load(file,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||(n.startsWith('@/')?{}:require(n)),process:{env:{}},console});return m.exports}
let session={email:'root@test',role:'super_admin'},person=null;
const db={from(){return{select(){return this},eq(){return this},maybeSingle:async()=>({data:null,error:null})}}};
const status=load('lib/employee-status.ts');
const api=load('app/api/ops-desk/route.ts',{'@/lib/auth-token':{SESSION_COOKIE:'session',verifySessionToken:async()=>session},'@/lib/supabase':{getSupabaseServerClient:()=>db},'@/lib/employee-access':{linkedEmployee:async()=>person},'@/lib/employee-status':status});
const check=async()=>{const r=await api.GET(new NextRequest('https://ops.test/api/ops-desk?type=profile'));assert.equal(r.status,200);return(await r.json()).profile.can_record_sanctions};
(async()=>{
 assert.equal(await check(),true,'Superadmin sees icon without employee link');
 for(const role of ['viewer','admin','spv','jr_spv','coordinator']){
  session={email:'employee@test',role,employee_nik:'N1'};
  for(const position of ['Leader','Koordinator','Coordinator','Operational Inbound Jr. Supervisor','SPV']){person={name:'Test',position,active:true};assert.equal(await check(),true);}
  for(const position of ['Kurir Motor','Staff Operational','SPC LEGUTI']){person={name:'Test',position,active:true};assert.equal(await check(),false);}
  person={name:'Test',position:'SPV',active:false};assert.equal(await check(),false);
  person={name:'Test',position:'SPV',active:true,employment:'Resign'};assert.equal(await check(),false);
  person=null;assert.equal(await check(),false);
 }
 console.log('PASS: PWA icon capability follows employee position/active status except Superadmin, not account role or hub.');
})().catch(e=>{console.error(e);process.exitCode=1});
