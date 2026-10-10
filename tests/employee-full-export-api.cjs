const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
let session={email:'admin@test.invalid',role:'admin'},available=true,fail=false;
const employees=Array.from({length:1005},(_,i)=>({nik:String(i).padStart(7,'0'),name:'Nama '+i,tgrid:'',active:i%2===0,employment:i%3===0?'Resign':'Aktif'}));
const db={from(table){let bounds=[0,999],ids=null;const q={select(){return q},order(){return q},range(a,b){bounds=[a,b];return q},in(key,values){ids=values;return q},then(resolve){const rows=table==='ops_employees'?employees.slice(bounds[0],bounds[1]+1):ids.map(nik=>({employee_nik:nik,tgrid:'TGR'+nik}));return Promise.resolve({data:rows,error:fail?{code:'error'}:null}).then(resolve)}};return q}};
const mocks={'@/lib/supabase':{getSupabaseServerClient:()=>available?db:null},'@/lib/auth-token':{SESSION_COOKIE:'session',verifySessionToken:async()=>session}};
const moduleObject={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/ops-desk/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:moduleObject,exports:moduleObject.exports,require:name=>mocks[name]||(name.startsWith('@/')?{}:require(name)),process,console,Map,Date});
const get=()=>moduleObject.exports.GET(new NextRequest('https://ops.test/api/ops-desk?type=employees&view=export&q=nonexistent'));
(async()=>{
 let response=await get();assert.equal(response.status,200);let data=await response.json();assert.equal(data.items.length,1005);assert.equal(data.items[0].tgrid,'TGR0000000');assert(data.items.some(row=>!row.active));assert(data.items.some(row=>row.employment==='Resign'));assert(data.exported_at);assert(response.headers.get('cache-control').includes('no-store'));
 employees[0].name='Nama Baru';employees.push({nik:'NEW',name:'Karyawan Baru',active:true});data=await(await get()).json();assert.equal(data.items[0].name,'Nama Baru');assert.equal(data.items.length,1006);
 session={email:'staff@test.invalid',role:'viewer'};assert.equal((await get()).status,403);
 session=null;assert.equal((await get()).status,401);
 session={email:'spv@test.invalid',role:'spv'};available=false;assert.equal((await get()).status,503,'Never export preview Excel when database unavailable');available=true;fail=true;assert.equal((await get()).status,503);
 console.log('PASS: fresh full database export, >1000 records, all statuses, courier TGR IDs, permission checks, no-store and fail-closed database errors.');
})().catch(e=>{console.error(e);process.exitCode=1});
