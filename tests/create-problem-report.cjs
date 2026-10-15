const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextResponse}=require('next/server');
function load(file,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||require(n),process:{env:{}},File,Uint8Array,crypto,Date,console});return m.exports;}
const workflow=load('lib/report-workflow.ts'),damage=load('lib/damage-case.ts'),problem=load('lib/problem-records.ts');
let rows=[],metadata=[],uploads=new Map(),duplicate=false,mode='',calls=0,push=0;
const db={from(table){let filters=[];const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},maybeSingle:async()=>({data:table==='ops_problems'?rows.find(r=>filters.every(f=>f(r)))||null:null,error:null})};return q;},rpc:async(name,args)=>{
 if(name==='ops_report_awb_exists')return {data:duplicate,error:null};
 calls++;
 if(mode==='missing')return {error:{code:'PGRST202'}};
 if(mode==='race')return {error:{code:'23505',message:'AWB_DUPLICATE'}};
 if(mode==='uncertain')return {error:{code:'08006'}};
 const item={id:args.p_id,...args.p_values,created_by_email:args.p_actor,status:'open'};
 rows.push(item);metadata.push(...args.p_photos);
 return mode==='committed-error'?{error:{code:'08006'}}:{data:{...item,_reused:false},error:null};
 }};
const handler=load('lib/create-problem-report.ts',{'next/server':{NextResponse,after:fn=>{void fn();}},'./report-workflow':workflow,'./problem-records':problem,'./damage-case':damage,'./web-push':{dispatchPush:async()=>{push++;}},'./imagekit':{isImageKitConfigured:()=>true,uploadToImageKit:async(file,path)=>{if(mode==='upload-error')throw Error('Upload gagal');uploads.set(path,file);return {path,fileId:path};},deleteFromImageKit:async id=>{uploads.delete(id);}}}).createProblemReport;
const id='10000000-0000-4000-8000-000000000001',actor={email:'staff@test'};
const body={id,awb:' jt123 ',division:'Inbound',category:'INVALID',description:'Rusak'};
function form(file=new File([new Uint8Array([255,216,255,1])],'proof.jpg',{type:'image/jpeg'})){const d=new FormData();d.append('photos',file);return d;}
function reset(){rows=[];metadata=[];uploads.clear();duplicate=false;mode='';calls=0;push=0;}
(async()=>{
 let r=await handler(db,actor,body,form());assert.equal(r.status,200);assert.equal((await r.json()).item.awb,'JT123');assert.equal(rows.length,1);assert.equal(metadata.length,1);assert.equal(uploads.size,1);assert.equal(push,1);
 await handler(db,actor,body,form());assert.equal(calls,1);assert.equal(uploads.size,1,'Retry does not upload twice');
 assert.equal((await handler(db,{email:'other@test'},body,form())).status,409);
 reset();duplicate=true;r=await handler(db,actor,body,form());assert.equal(r.status,409);assert.equal(uploads.size,0);assert.equal(calls,0);
 reset();mode='race';r=await handler(db,actor,body,form());assert.equal(r.status,409);assert.equal(uploads.size,0,'Known duplicate failure cleans unused photos');
 reset();mode='missing';r=await handler(db,actor,body,form());assert.equal(r.status,503);assert.equal(uploads.size,0);
 reset();mode='upload-error';r=await handler(db,actor,body,form());assert.equal(r.status,503);assert.equal(calls,0);
 reset();mode='committed-error';r=await handler(db,actor,body,form());assert.equal(r.status,200);assert.equal(uploads.size,1,'Committed evidence is preserved after lost RPC response');
 reset();mode='uncertain';r=await handler(db,actor,body,form());assert.equal(r.status,503);assert.equal(uploads.size,1,'Unknown commit outcome never deletes potentially committed evidence');
 reset();r=await handler(db,actor,body,form(new File(['not-a-photo'],'bad.jpg',{type:'image/jpeg'})));assert.equal(r.status,503);assert.equal(calls,0);
 r=await handler(db,actor,{...body,id:'bad'},null);assert.equal(r.status,400);
 console.log('PASS: atomic Problem handler, stable ID/owner checks, duplicate preflight and race cleanup, upload failure, missing RPC, lost response recovery and preservation of unconfirmed evidence.');
})().catch(e=>{console.error(e);process.exit(1);});
