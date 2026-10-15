const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest,NextResponse}=require('next/server');
function load(file,mocks={},extras={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||require(n),process:{env:{}},Date,URL,File,Uint8Array,crypto,console,...extras});return m.exports;}
const workflow=load('lib/report-workflow.ts');
const now=Date.parse('2026-10-15T05:00:00Z');
assert.equal(workflow.awbKey(' j t 123 '),'JT123');
assert.equal(workflow.reportAge('2026-10-15T04:00:00Z','open',now).tone,'normal');
assert.equal(workflow.reportAge('2026-10-15T02:00:00Z','open',now).tone,'warning');
assert.equal(workflow.reportAge('2026-10-14T05:00:00Z','open',now).tone,'urgent');
for(const status of ['closed','resolved','completed'])assert.equal(workflow.reportAge('2026-10-01T00:00:00Z',status,now),null);
assert.equal(workflow.reportAge('bad','open',now),null);
let session={email:'owner@test',role:'viewer'},fail=false,duplicate=false;
const id='10000000-0000-4000-8000-000000000001';
const tables={ops_damage_cases:[{id,awb:'JT123',status:'open',created_by:'owner@test',created_at:'2026-10-15T01:00:00Z'}],ops_problems:[],ops_barkur:[],ops_report_history:[{id:'event',entity_type:'damage',entity_id:id,actor_email:'admin@test',new_status:'open'}]};
let rpcArgs;
const db={rpc:async(name,args)=>{rpcArgs={name,args};return {data:duplicate,error:fail?{code:'missing'}:null};},from(table){let checks=[],limit=100,start=0,head=false;const q={select(_v,opts){head=opts?.head;return q},eq(k,v){checks.push(r=>r[k]===v);return q},in(k,v){checks.push(r=>v.includes(r[k]));return q},order(){return q},limit(n){limit=n;return q},range(a,b){start=a;limit=b-a+1;return q},maybeSingle:()=>run(true),then:(yes,no)=>run().then(yes,no)};async function run(single=false){const rows=(tables[table]||[]).filter(r=>checks.every(f=>f(r)));return {data:single?rows[0]||null:head?null:rows.slice(start,start+limit),count:rows.length,error:fail?{code:'missing'}:null};}return q;}};
const api=load('app/api/report-activity/route.ts',{'@/lib/report-workflow':workflow,'@/lib/auth-token':{SESSION_COOKIE:'session',verifySessionToken:async()=>session},'@/lib/supabase':{getSupabaseServerClient:()=>db}});
const get=q=>api.GET(new NextRequest('https://app.test/api/report-activity?'+q));
(async()=>{
 assert.equal((await get('type=queue')).status,403);
 assert.equal((await get(`type=history&kind=damage&id=${id}`)).status,200);
 let d=await(await get(`type=history&kind=damage&id=${id}`)).json();assert.equal(d.items[0].actor_email,'Admin / pelapor');
 session={email:'other@test',role:'viewer'};assert.equal((await get(`type=history&kind=damage&id=${id}`)).status,404);
 session={email:'admin@test',role:'admin'};d=await(await get('type=queue')).json();assert.equal(d.groups.length,3);assert.equal(d.groups[0].total,1);assert.equal(d.groups[0].items[0].url,`/dashboard/ops-desk/damage-cases?id=${id}`);
 d=await(await get(`type=history&kind=damage&id=${id}`)).json();assert.equal(d.items[0].actor_email,'admin@test');
 assert.equal((await get(`type=history&kind=damage&id=${id}&offset=-1`)).status,400);
 assert.equal((await get('type=history&kind=damage&id=bad')).status,400);
 assert.equal((await get('type=duplicate&kind=damage&awb=')).status,400);
 assert.equal((await get('type=duplicate&kind=evil&awb=abc')).status,400);
 duplicate=true;d=await(await get('type=duplicate&kind=damage&awb=j%20t123')).json();assert.equal(d.duplicate,true);assert.equal(rpcArgs.args.p_awb,'JT123');assert(!('id'in d));assert(!('created_by'in d));
 fail=true;assert.equal((await get('type=queue')).status,503);fail=false;
 session=null;assert.equal((await get('type=queue')).status,401);
 // Upload behavior is observable and never claims success until the server confirms it.
 let online=true,next={},states=[],instances=[];
 class Xhr{constructor(){this.upload={};instances.push(this);}open(method,url){this.method=method;this.url=url;}send(body){this.body=body;queueMicrotask(()=>{if(next.network)return this.onerror();if(next.timeout)return this.ontimeout();this.upload.onprogress({lengthComputable:true,loaded:5,total:10});this.upload.onload();this.status=next.status||200;this.responseText=next.raw??JSON.stringify(next.body||{ok:true,item:{id}});this.onload();});}}
 const uploader=load('lib/report-upload.ts',{}, {navigator:{get onLine(){return online;}},XMLHttpRequest:Xhr,queueMicrotask});
 const body=new FormData();body.append('id',id);
 let saved=await uploader.uploadReport('/api/damage-cases',body,s=>states.push(s));assert.equal(saved.item.id,id);assert.deepEqual(states.map(s=>s.stage),['uploading','uploading','saving','success']);assert.equal(instances[0].body.get('id'),id);
 next={timeout:true};states=[];await assert.rejects(()=>uploader.uploadReport('/api/damage-cases',body,s=>states.push(s)),/Konfirmasi/);assert.equal(states.at(-1).stage,'error');
 next={network:true};await assert.rejects(()=>uploader.uploadReport('/api/damage-cases',body,()=>{}),/Koneksi/);
 next={raw:'<html>'};await assert.rejects(()=>uploader.uploadReport('/api/damage-cases',body,()=>{}),/Jawaban server/);
 next={status:409,body:{error:'AWB sudah dilaporkan'}};await assert.rejects(()=>uploader.uploadReport('/api/damage-cases',body,()=>{}),/AWB/);
 online=false;const count=instances.length;await assert.rejects(()=>uploader.uploadReport('/api/damage-cases',body,()=>{}),/offline/);assert.equal(instances.length,count,'Offline does not issue a request');
 console.log('PASS: report age thresholds, queue authorization and destinations, owner-only history, redacted PWA actors, duplicate privacy/normalization, validation, upload progress, timeout, lost connection, bad JSON, HTTP errors, offline and stable retry payload.');
})().catch(e=>{console.error(e);process.exit(1);});
