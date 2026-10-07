const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
function load(file,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||(n.startsWith('@/')?{}:require(n)),process:{env:{}},console});return m.exports;}
const status=load('lib/employee-status.ts');
for(const value of ['Resign',' RESIGN ','Resigned','Resign / Belum Diganti']){assert.equal(status.employeeStatus({active:true,employment:value}),'resigned');assert.equal(status.employeeState({active:true,employment:value}).active,false);}
assert.equal(status.employeeStatus({active:false,employment:'PKWT'}),'inactive');
assert.equal(status.employeeStatus({active:true,employment:'Nonaktif'}),'inactive');
assert.equal(status.employeeState({active:true,employment:'PKWT'}).employment,'PKWT');
let session={email:'admin@example.test',role:'admin'};
let rows=[{nik:'A',name:'Active',active:true,employment:'PKWT'},{nik:'R',name:'Resigned',active:false,employment:'Resign'},{nik:'I',name:'Replaced',active:false,employment:'Nonaktif'}];
let summary=status.employeeSummary(rows);assert.equal(summary.formation,304);assert.equal(summary.active.length,1);assert.equal(summary.resigned.length,1);assert.equal(summary.inactive.length,1);assert.equal(summary.current.length,2);
assert.equal(status.employeeSummary([]).formation,304);assert.equal(status.employeeSummary(Array.from({length:500},()=>({active:true}))).formation,304);
const db={from(table){let mode='select',payload,filters=[],bounds=[0,999];const q={select(){return q},limit(n){bounds=[0,n-1];return q},order(){return q},range(a,b){bounds=[a,b];return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},insert(p){mode='insert';payload=p;return q},upsert(p){mode='upsert';payload=p;return q},update(p){mode='update';payload=p;return q},then(resolve,reject){return Promise.resolve().then(()=>{if(table!=='ops_employees')return{data:[],error:null};if(mode==='insert')rows.push(payload);if(mode==='update')rows.filter(r=>filters.every(f=>f(r))).forEach(r=>Object.assign(r,payload));if(mode==='upsert')for(const p of payload){const r=rows.find(r=>r.nik===p.nik);if(r)Object.assign(r,p);else rows.push(p);}const data=rows.filter(r=>filters.every(f=>f(r))).slice(bounds[0],bounds[1]+1);return {data,error:null};}).then(resolve,reject)}};return q}};
const api=load('app/api/ops-desk/route.ts',{'@/lib/employee-status':status,'@/lib/supabase':{getSupabaseServerClient:()=>db},'@/lib/auth-token':{SESSION_COOKIE:'jne_session',verifySessionToken:async()=>session}});
const post=body=>api.POST(new NextRequest('http://localhost/api/ops-desk',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
(async()=>{
 assert.equal((await post({action:'updateEmployee',nik:'A',name:'Active',active:true,employment:'Resign'})).status,200);
 assert.equal(rows[0].active,false);assert.equal(rows[0].employment,'Resign');
 assert.equal((await post({action:'updateEmployee',nik:'A',name:'Active',active:false,employment:'Nonaktif'})).status,200);
 assert.equal(status.employeeStatus(rows[0]),'inactive');
 await post({action:'bulkEmployees',rows:[{nik:'A',name:'Active',active:true,employment:'PKWT'}]});
 assert.equal(rows.find(r=>r.nik==='R').employment,'Resign','Omitted resignation must not be converted to replaced');
 await post({action:'bulkEmployees',rows:[{nik:'A',name:'Active',active:true,employment:'RESIGN'}]});
 assert.equal(rows[0].active,false,'Bulk resignation must not grant active employee access');
 rows=Array.from({length:1002},(_,i)=>({nik:String(i),active:true,employment:'PKWT'}));
 const response=await api.GET(new NextRequest('http://localhost/api/ops-desk?type=employees&view=summary'));
 assert.equal(response.status,200);assert.equal((await response.json()).items.length,1002);assert.equal(response.headers.get('cache-control'),'private, no-store');
 session={email:'viewer@example.test',role:'viewer'};assert.equal((await post({action:'updateEmployee',nik:'0',employment:'Aktif'})).status,403);
 session=null;assert.equal((await api.GET(new NextRequest('http://localhost/api/ops-desk?type=employees&view=summary'))).status,401);
 console.log('PASS: fixed 304 formation, separate statuses, manual and bulk resignation persistence, preserved vacancies, complete paginated summary and write access.');
})().catch(e=>{console.error(e);process.exitCode=1});
