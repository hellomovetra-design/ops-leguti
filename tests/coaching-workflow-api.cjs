const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
function load(file,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{esModuleInterop:true,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||require(n),process:{env:{},cwd:()=>process.cwd()},Date,File,FormData,Uint8Array,Buffer,crypto:globalThis.crypto});return m.exports}
const application=load('lib/sanction-form.ts');
const workflow=load('lib/coaching-workflow.ts'),id='11111111-1111-4111-8111-111111111111';
let session={email:'coach@test',role:'viewer'},uploaded=0,removed=0;
const record={id,kind:'coaching',employee_name:'Employee',employee_nik:'N1',position:'Kurir Motor',hub:'Hub',superior_name:'Coach',recorder_name:'Coach',created_by:'coach@test',updated_at:'2026-10-30T00:00:00Z',incident_date:'2026-10-30',workflow_status:'awaiting_signatures',photos:[{name:'proof',path:'private'}],coaching_details:{session_time:'09:00',duration_minutes:'30',obstacles:'Obstacles',targets:'Targets',challenges:'Challenges',action_plan:'Plan',summary:'Summary'}};
const records=[record,{...record,id:'22222222-2222-4222-8222-222222222222',created_by:'other@test'}];
let staleRace=false;
const db={from(){let filters=[],mode='select',payload,bounds=[0,999];const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},order(){return q},range(a,b){bounds=[a,b];return q},update(p){mode='update';payload=p;return q},maybeSingle:()=>run(true),then:(resolve,reject)=>run(false).then(resolve,reject)};async function run(single){let rows=records.filter(r=>filters.every(fn=>fn(r)));if(mode==='update'){if(staleRace)return{data:null,error:null};rows.forEach(r=>Object.assign(r,payload,{updated_at:new Date(Date.parse(r.updated_at)+1000).toISOString()}));}return{data:single?rows[0]||null:rows.slice(bounds[0],bounds[1]+1),error:null}}return q}};
const api=load('app/api/employee-sanctions/workflow/route.ts',{
 '@/lib/auth-token':{SESSION_COOKIE:'session',verifySessionToken:async()=>session},'@/lib/supabase':{getSupabaseServerClient:()=>db},'@/lib/employee-access':{linkedEmployee:async()=>({nik:'L1',name:'Coach'})},'@/lib/employee-sanctions':{SANCTION_ADMINS:['super_admin','admin','spv']},'@/lib/coaching-workflow':workflow,'@/lib/sanction-form':application,'@/lib/sanction-document':{sanctionDocx:async()=>Buffer.from('SANCTION-DOCX'),sanctionPrintHtml:()=>'<html>sanction</html>'},
 '@/lib/coaching-document':{coachingDocx:async()=>Buffer.from('DOCX'),coachingPrintHtml:()=>'<html>print</html>'},
 '@/lib/imagekit':{isImageKitConfigured:()=>true,uploadToImageKit:async(file,path)=>{uploaded++;return{path,fileId:'FILE'+uploaded}},deleteFromImageKit:async()=>{removed++},fetchFromImageKit:async()=>new Response('%PDF-1.7')}
});
const get=query=>api.GET(new NextRequest('https://ops.test/api/employee-sanctions/workflow?'+query));
const requestId='33333333-3333-4333-8333-333333333333';
const post=(extra={},file=null,origin='https://ops.test')=>{const form=new FormData();for(const[k,v]of Object.entries({id,scope:'mine',request_id:requestId,action:'send_hrd',updated_at:record.updated_at,employee_signed:'true',coach_signed:'true',...extra}))form.set(k,String(v));if(file)form.set('final_scan',file);return api.POST(new NextRequest('https://ops.test/api/employee-sanctions/workflow',{method:'POST',headers:{origin},body:form}))};
(async()=>{
 session=null;assert.equal((await get('type=mine')).status,401);session={email:'coach@test',role:'viewer'};
 assert.equal((await get('type=mine&scope=admin')).status,403);const own=await(await get('type=mine')).json();assert.equal(own.items.length,1);
 assert.equal((await get('type=word&id='+records[1].id)).status,404);assert.equal((await get('type=word&id='+id)).status,200);assert.equal((await get('type=print&id='+id)).headers.get('content-type'),'text/html; charset=utf-8');assert.equal((await get('type=final&id='+id)).status,404);
 assert.equal((await post({id:records[1].id})).status,404);assert.equal((await post({},null,'https://evil.test')).status,403);assert.equal((await post({coach_signed:'false'})).status,409);assert.equal((await post({action:'finalize',hrd_signed:'true'})).status,409);
 assert.equal((await post()).status,200);assert.equal(record.workflow_status,'sent_hrd');const version=record.updated_at;
 assert.equal((await post({updated_at:'stale'})).status,200,'Idempotent acknowledgement of same signed stage request');assert.equal(record.updated_at,version);
 const finalId='44444444-4444-4444-8444-444444444444';
 assert.equal((await post({action:'finalize',request_id:finalId,hrd_signed:'true'})).status,400);
 const pdf=new File(['%PDF-1.7\nSigned HRD'],'signed.pdf',{type:'application/pdf'});
 staleRace=true;assert.equal((await post({action:'finalize',request_id:finalId,hrd_signed:'true'},pdf)).status,409);assert.equal(removed,1,'Race loser upload cleaned');staleRace=false;
 assert.equal((await post({action:'finalize',request_id:finalId,hrd_signed:'true'},pdf)).status,200);assert.equal(record.workflow_status,'final');assert.equal(record.hrd_signed,true);assert.equal((await get('type=final&id='+id)).headers.get('content-type'),'application/pdf');
 const uploadedBefore=uploaded;assert.equal((await post({action:'finalize',request_id:finalId,hrd_signed:'true',updated_at:'stale'},pdf)).status,200);assert.equal(uploaded,uploadedBefore,'Final retry does not reupload');
 assert.equal((await post({action:'finalize',request_id:'55555555-5555-4555-8555-555555555555',hrd_signed:'true'},pdf)).status,409,'Final locked');
 session={email:'admin@test',role:'admin'};assert.equal((await get('type=final&scope=admin&id='+id)).status,200);records[1].kind='sp1';records[1].sanction_details={violations:['negligence'],location:'Tangerang'};assert.equal((await get('type=word&scope=admin&id='+records[1].id)).status,200,'Sanction template now available');assert.equal((await post({id:records[1].id,scope:'admin',updated_at:records[1].updated_at})).status,409,'Sanction needs both approval signatures');assert.equal((await post({id:records[1].id,scope:'admin',updated_at:records[1].updated_at,approver_one_signed:'true',approver_two_signed:'true'})).status,200);
 records.push({...record,id:'66666666-6666-4666-8666-666666666666',kind:'coaching',created_by:'coach@test',workflow_status:'awaiting_signatures',workflow_request_id:null,coaching_details:null,final_document:null});
 session={email:'coach@test',role:'viewer'};
 const directId=records[2].id;
 assert.equal((await post({id:directId,action:'finalize',signed_complete:'false',hrd_signed:'false'},pdf)).status,409);
 assert.equal((await post({id:directId,action:'finalize',signed_complete:'true',hrd_signed:'false'},pdf)).status,200);
 assert.equal(records[2].signed_complete,true);assert.equal(records[2].hrd_signed,false);
 console.log('PASS: own PWA documents, admin scope, cross-user denial, private downloads, signature stages, final scan, immutable final, optimistic conflict cleanup and safe retry.');
})().catch(e=>{console.error(e);process.exitCode=1});
