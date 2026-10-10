const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(path,mocks={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,URLSearchParams,process,require:name=>mocks[name]||require(name)});return module.exports;}
const status=load('lib/employee-status.ts'),employment=load('lib/employee-employment.ts');
const history=load('lib/personnel-history.ts',{'./employee-status':status,'./employee-employment':employment});
const before={nik:'001',name:'A',position:'Kurir Motor',active:true,employment_type:'contract'},after={...before,nik:'002',hub:'SP MALOKO',active:false,employment:'Resign'};
const diff=history.personnelDiff({before_data:before,after_data:after});
assert(diff.some(x=>x.field==='NIK'&&x.before==='001'&&x.after==='002'));
assert(diff.some(x=>x.field==='Status karyawan'&&x.after==='Resign / Belum Diganti'));
assert(!diff.some(x=>x.field==='Kepegawaian'),'Contract does not change on resignation');
assert.equal(history.personnelDiff({before_data:before,after_data:before}).length,0);
assert(history.personnelDiff({before_data:null,after_data:before}).length>0);
assert(history.personnelDiff({before_data:before,after_data:null}).some(x=>x.field==='Nama'&&x.before==='A'&&x.after===''));
for(const params of ['from=2026-02-30','from=2026-10-10&to=2026-10-09','action=bad'])assert.throws(()=>history.personnelFilters(new URLSearchParams(params)));
const calls=[],query=new Proxy({}, {get:(_,key)=>(...args)=>{calls.push([key,...args]);return query;}});
history.applyPersonnelFilters(query,history.personnelFilters(new URLSearchParams('from=2026-10-10&to=2026-10-10&q=A%2Cevil%25')));
assert(calls.some(x=>x[0]==='lt'&&x[2]==='2026-10-10T17:00:00.000Z'),'End includes full Jakarta day');
assert(!calls.find(x=>x[0]==='or')[1].includes('A,evil'));
let role='viewer',dbCalls=0;
const db={from(){dbCalls++;return new Proxy({}, {get:(_,key)=>key==='then'?(resolve)=>resolve({data:[],error:null}):()=>db.from()});}};
const api=load('app/api/personnel-changes/route.ts',{
 'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200,headers:options.headers})}},
 '@/lib/auth-token':{SESSION_COOKIE:'session',verifySessionToken:()=>role?{role}:null},
 '@/lib/supabase':{getSupabaseServerClient:()=>db},'@/lib/personnel-history':history
});
(async()=>{
 const req={cookies:{get:()=>({value:'test'})},nextUrl:new URL('https://ops.test/api/personnel-changes')};
 for(const denied of ['viewer','coordinator',null]){role=denied;const result=await api.GET(req);assert.equal(result.status,403);}
 assert.equal(dbCalls,0,'No history queries for denied users');
 for(const allowed of ['super_admin','admin','spv']){role=allowed;const result=await api.GET(req);assert.equal(result.status,200);assert.equal(result.headers['Cache-Control'],'private, no-store');}
 const sql=fs.readFileSync('supabase/migrations/20261010_personnel_history.sql','utf8');
 assert(sql.includes('after insert or update or delete'));assert(sql.includes('enable row level security'));assert(sql.includes("claims->>'role'='service_role'"));assert(sql.includes('txid_current()'));assert(sql.includes('old_data is not distinct from new_data'));
 assert(!sql.includes('insert into public.ops_personnel_changes select'),'No fabricated history backfill');
 const page=fs.readFileSync('app/master/personnel-changes/page.tsx','utf8');assert(page.includes('PersonnelChanges'));assert(!page.includes('EmployeeAdmin'));
 console.log('PASS: history diffs, contract/status distinction, Jakarta dates, literal search, role restrictions, no-store, automatic transactional capture and distinct page.');
})().catch(e=>{console.error(e);process.exitCode=1;});
