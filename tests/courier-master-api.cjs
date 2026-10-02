const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
function load(file,overrides={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require:n=>overrides[n]??require(n),TextDecoder,TextEncoder,Uint8Array,Buffer,File,console,process:{env:{}}});return m.exports;}
const core=load('lib/courier-master.ts');
let session={email:'admin@test.example',role:'admin'},revision=1,failure=false,rpcCalls=0;
const rows=[{id:'one',tgrid:'TGR159',name:'Nama A',employee_nik:'1',active:true,...Object.fromEntries(core.MASTER_FIELDS.slice(2).map(k=>[k,core.REQUIRED_MASTER_FIELDS.includes(k)?'Test':'']))}];
const db={from(table){let range=[0,999];const q={select(){return q},eq(){return q},single(){return q},order(){return q},range(a,b){range=[a,b];return q},then(resolve,reject){return Promise.resolve(failure?{error:{message:'offline'}}:{data:table==='ops_courier_master_revision'?{revision}:table==='ops_courier_master'?rows.slice(range[0],range[1]+1):[],error:null}).then(resolve,reject)}};return q;},async rpc(name,args){assert.equal(name,'ops_sync_courier_master');assert.equal(args.p_actor,session.email);assert.equal(args.p_revision,revision);rpcCalls++;return {data:{changed:args.p_operations.length}};}};
const api=load('app/api/courier-master/route.ts',{'@/lib/supabase':{getSupabaseServerClient:()=>db},'@/lib/auth-token':{SESSION_COOKIE:'jne_session',verifySessionToken:async()=>session},'@/lib/courier-master':core,'@/lib/courier-master-export':{}});
const post=(body,origin='https://ops.movetra.id')=>api.POST(new NextRequest('https://ops.movetra.id/api/courier-master',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)}));
(async()=>{
 const body={action:'preview',month:'2026-10',rows:[{tgrid:'TGR159',name:'Nama A',area:'D',row:'test'}]};
 let r=await post(body),p=await r.json();assert.equal(r.status,200);assert.equal(p.counts.updated,1);assert.equal(rpcCalls,0);
 r=await post({...body,action:'commit',review:p.review});assert.equal(r.status,200);assert.equal(rpcCalls,1);
 revision++;r=await post({...body,action:'commit',review:p.review});assert.equal(r.status,409);assert.equal(rpcCalls,1);
 assert.equal((await post(body,'https://evil.example')).status,403);
 session.role='viewer';assert.equal((await post(body)).status,403);assert.equal((await api.GET(new NextRequest('https://ops.movetra.id/api/courier-master'))).status,200);
 session=null;assert.equal((await post(body)).status,401);assert.equal((await api.GET(new NextRequest('https://ops.movetra.id/api/courier-master'))).status,401);
 session={email:'admin@test.example',role:'admin'};failure=true;assert.equal((await api.GET(new NextRequest('https://ops.movetra.id/api/courier-master'))).status,503);
 console.log('PASS: auth, role-based writes/read access, origin checks, preview without writes, confirmed commit, stale-preview rejection, explicit missing migration/database errors.');
})().catch(e=>{console.error(e);process.exitCode=1});
