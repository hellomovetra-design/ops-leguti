const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
function load(file,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||require(n),process:{env:{}},console,URL,Date,File,Response,Uint8Array,crypto:globalThis.crypto});return m.exports;}
const lib=load('lib/barkur.ts');
assert.equal(lib.barkurTime('2026-10-08T09:00'),'2026-10-08T02:00:00.000Z');
assert.throws(()=>lib.barkurTime('2026-02-30T09:00'));
assert.throws(()=>lib.driveEvidence('javascript:alert(1)'));
assert.throws(()=>lib.driveEvidence('https://drive.google.com.evil.test/file'));
assert.throws(()=>lib.barkurFilters(new URLSearchParams('from=2026-10-09&to=2026-10-01')));
assert.equal(lib.emailDelay({incident_at:'2026-10-08T02:00:00Z',email_sent_at:'2026-10-08T04:59:00Z'}),'2 jam 59 menit');
let session={email:'admin@example.test',role:'admin'},rows=[],stored=new Map(),version=0,missing=false;
const db={from(){let mode='select',payload,filters=[],bounds=[0,999];const q={select(){return q},order(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},gte(k,v){filters.push(r=>+new Date(r[k])>=+new Date(v));return q},lte(k,v){filters.push(r=>+new Date(r[k])<=+new Date(v));return q},or(expr){const terms=expr.split(',').map(s=>s.split('.ilike.%'));filters.push(r=>terms.some(([key,term])=>String(r[key]).toLowerCase().includes(term.slice(0,-1).toLowerCase())));return q},range(a,b){bounds=[a,b];return q},insert(p){mode='insert';payload=p;return q},update(p){mode='update';payload=p;return q},single(){return run(true)},maybeSingle(){return run(true)},then(resolve,reject){return run(false).then(resolve,reject)}};
async function run(single){if(missing)return{error:{code:'42P01'},data:null};if(mode==='insert'){rows.push({...payload,created_at:'2026-10-08T01:00:00Z',updated_at:String(++version)});}const found=rows.filter(r=>filters.every(f=>f(r)));if(mode==='update')found.forEach(r=>Object.assign(r,payload,{updated_at:String(++version)}));return{data:single?found[0]||null:found.slice(bounds[0],bounds[1]+1),count:found.length,error:null};}return q},storage:{from(){return{async upload(path,file){stored.set(path,file);return{error:null}},async download(path){return{data:stored.get(path),error:null}},async remove(paths){paths.forEach(path=>stored.delete(path));return{error:null}}}}}};
const api=load('app/api/barkur/route.ts',{'@/lib/barkur':lib,'@/lib/supabase':{getSupabaseServerClient:()=>db},'@/lib/auth-token':{SESSION_COOKIE:'jne_session',verifySessionToken:async()=>session}});
const id='11111111-1111-4111-8111-111111111111';
async function post(extra={},file){const form=new FormData();Object.entries({id,action:'create',awb:'JT123',bag_number:'BAG1',origin:'CGK',destination:'SPC LEGUTI',incident_at:'2026-10-08T09:00',email_sent_at:'2026-10-08T10:00',pic:'Tim OTS',status:'open',description:'Kurang fisik',resolution:'',evidence_link:'',...extra}).forEach(([k,v])=>form.append(k,v));if(file)form.append('evidence',file);return api.POST(new NextRequest('http://localhost/api/barkur',{method:'POST',body:form}));}
const get=(q='')=>api.GET(new NextRequest('http://localhost/api/barkur'+q));
(async()=>{
 session=null;assert.equal((await get()).status,401);session={email:'viewer@example.test',role:'viewer'};assert.equal((await get()).status,403);assert.equal((await post()).status,403);session={email:'admin@example.test',role:'admin'};
 for(const extra of [{awb:''},{bag_number:''},{origin:''},{pic:''},{status:'bad'},{status:'completed'},{email_sent_at:'2026-10-08T08:59'},{evidence_link:'https://evil.test'}])assert.equal((await post(extra)).status,400,JSON.stringify(extra));
 const png=new File([new Uint8Array([137,80,78,71,13,10,26,10,1])],'email.png',{type:'image/png'});
 assert.equal((await post({},new File(['notpng'],'fake.png',{type:'image/png'}))).status,400);
 let result=await(await post({},png)).json();assert(result.ok);assert.equal(rows.length,1);assert.equal(stored.size,1);assert(result.item.evidence[0].url.includes('type=evidence'));assert(!result.item.evidence[0].path);
 await post({},png);assert.equal(rows.length,1);assert.equal(stored.size,1,'Retry must not upload twice');
 const evidenceUrl=result.item.evidence[0].url.split('?')[1];assert.equal((await get('?'+evidenceUrl)).status,200);assert.equal((await get('?type=evidence&id='+id)).status,400);
 assert.equal((await post({action:'update',updated_at:'stale'})).status,409);
 result=await(await post({action:'update',updated_at:rows[0].updated_at,status:'completed',resolution:'Barang ditemukan',evidence_link:'https://drive.google.com/file/d/old/view'})).json();assert(result.ok);assert.equal(result.item.evidence.length,1);
 assert.equal((await(await get('?q=JT123')).json()).total,1);assert.equal((await(await get('?q=NOTFOUND')).json()).total,0);assert.equal((await(await get('?status=open')).json()).total,0);
 assert.equal((await get('?offset=-1')).status,400);assert.equal((await get('?from=2026-02-30')).status,400);
 const csv=await(await get('?type=export')).text();assert(csv.includes('http://localhost/api/barkur?type=evidence'));assert(csv.includes('Barang ditemukan'));assert(csv.includes('drive.google.com'));
 session=null;assert.equal((await get('?'+evidenceUrl)).status,401);session={email:'admin@example.test',role:'admin'};missing=true;assert.equal((await get()).status,503);
 assert(lib.barkurCsv([{...rows[0],awb:'=SUM(1)'}],'https://ops.movetra.id').includes("'=SUM(1)"));
 console.log('PASS: BARKUR auth/roles, WIB/date validation, Drive URL safety, screenshot validation, persistence, safe retries, evidence access, optimistic edits, filters/export, missing migration.');
})().catch(e=>{console.error(e);process.exitCode=1});
