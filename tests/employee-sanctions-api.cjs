const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
function load(file,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||require(n),process:{env:{}},URL,Date,console,File,FormData,Uint8Array,crypto:globalThis.crypto});return m.exports}
const application=load('lib/sanction-form.ts'),employment=load('lib/employee-employment.ts');
const workflow=load('lib/coaching-workflow.ts');
const status=load('lib/employee-status.ts'),model=load('lib/employee-sanctions.ts',{'./employee-status':status});
const people=[{nik:'C',name:'Coordinator',position:'Inbound Coordinator',active:true,hub:'SPC LEGUTI'},{nik:'L',name:'Leader A',position:'Inbound Delivery Leader',superior:'Coordinator',superior_nik:'C',active:true,hub:'SPC LEGUTI'},{nik:'K',name:'Kurir A',position:'Kurir Motor',superior:'Old spelling',superior_nik:'L',active:true,hub:'SPC LEGUTI'},{nik:'X',name:'Outside',position:'Kurir Motor',superior_nik:'OTHER',active:true},{nik:'R',name:'Former',position:'Kurir Motor',superior_nik:'L',active:false}];
assert.deepEqual(Array.from(model.sanctionTeam(people,'L'),p=>p.nik),['K']);
assert.deepEqual(Array.from(model.sanctionTeam(people,'C'),p=>p.nik),['L','K']);
assert.equal(model.sanctionTeam(people,'K').length,0);
assert.equal(model.sanctionRecorder({...people[1],employment:'Resign'}),false);
for(const position of ['Operational Inbound Jr. Supervisor','Operational Inbound Leguti Supervisor','JR SPV','SPV','Inbound Delivery Leader','Inbound Koordinator'])assert.equal(model.sanctionRecorder({position,active:true}),true);
for(const position of ['Kurir Motor','Staff Operational','Admin SPC LEGUTI'])assert.equal(model.sanctionRecorder({position,active:true}),false);
assert.equal(model.sanctionRecorder({position:'SPV',active:false}),false);
assert.equal(model.sanctionTeam([...people,{...people[1],nik:'L2'},{nik:'LEGACY',name:'Legacy',position:'Staff',superior:'Leader A',active:true}],'L').some(p=>p.nik==='LEGACY'),false);
let session={email:'leader@test.invalid',role:'viewer'},owner=people[1],records=[],fail=false;
const db={from(table){let filters=[],body,mode='select',bounds=[0,999];const q={select(){return q},order(){return q},range(a,b){bounds=[a,b];return q},limit(n){bounds=[0,n-1];return q},in(k,vs){filters.push(r=>vs.includes(r[k]));return q},eq(k,v){filters.push(r=>r[k]===v);return q},ilike(){return q},insert(v){body=v;mode='insert';return q},update(v){body=v;mode='update';return q},maybeSingle(){return exec(true)},single(){return exec(true)},then(resolve,reject){return exec(false).then(resolve,reject)}};
async function exec(single){if(fail)return{error:{code:'42P01'}};const source=table==='ops_employees'?people:table==='ops_user_employee_links'?[{email:'leader@test.invalid',employee_nik:'L'}]:records;let rows=source.filter(r=>filters.every(f=>f(r)));if(mode==='insert'){if(records.some(r=>r.id===body.id))return{error:{code:'23505'}};const row={...body,created_at:'2026-10-27T00:00:00Z',updated_at:'2026-10-27T00:00:00Z'};records.push(row);return{data:row};}if(mode==='update')rows.forEach(r=>Object.assign(r,body,{updated_at:'2026-10-27T01:00:00Z'}));return{data:single?rows[0]||null:rows.slice(bounds[0],bounds[1]+1)}}return q}};
let uploads=0;
const images={isImageKitConfigured:()=>true,uploadToImageKit:async(file,path)=>{uploads++;return{path,fileId:String(uploads)}},deleteFromImageKit:async()=>{},fetchFromImageKit:async()=>new Response(new Uint8Array([255,216,255]),{headers:{"content-type":"image/jpeg"}})};
const photoModel=load('lib/sanction-photos.ts',{'./imagekit':images});
const api=load('app/api/employee-sanctions/route.ts',{'@/lib/sanction-form':application,'@/lib/employee-employment':employment,'@/lib/coaching-workflow':workflow,'@/lib/imagekit':images,'@/lib/sanction-photos':photoModel,'@/lib/auth-token':{SESSION_COOKIE:'session',verifySessionToken:async()=>session},'@/lib/supabase':{getSupabaseServerClient:()=>db},'@/lib/employee-access':{linkedEmployee:async()=>owner},'@/lib/sanction-recorder':{sanctionRecorderIdentity:async(db,email,current)=>owner||(current?.role==='super_admin'&&email===current.email?{nik:null,name:'Superadmin'}:null)},'@/lib/employee-sanctions':model,'@/lib/employee-status':status});
const id='11111111-1111-4111-8111-111111111111';
const get=q=>api.GET(new NextRequest('https://ops.test/api/employee-sanctions'+(q||'')));
const post=(extra={},origin='https://ops.test',count=1)=>{const body=new FormData();for(const [k,v] of Object.entries({id,action:'create',scope:'mine',employee_nik:'K',kind:'coaching',description:'Catatan test',coaching_result:'Hasil test',incident_date:'2026-10-27',sanction_details:JSON.stringify({violations:['negligence'],location:'Tangerang'}),coaching_details:JSON.stringify({session_time:'09:30',duration_minutes:'30',obstacles:'Kendala',targets:'Target',challenges:'Tantangan',action_plan:'Rencana',summary:'Hasil'}),...extra}))body.set(k,String(v));for(let i=0;i<count;i++)body.append('photos',new File([new Uint8Array([255,216,255,1])],'bukti.jpg',{type:'image/jpeg'}));return api.POST(new NextRequest('https://ops.test/api/employee-sanctions',{method:'POST',headers:{origin},body}));};
(async()=>{
 session=null;assert.equal((await get()).status,401);assert.equal((await post()).status,401);session={email:'leader@test.invalid',role:'viewer'};
 owner=people[2];assert.equal((await get()).status,403);assert.equal((await post()).status,403);owner=people[1];
 assert.equal((await get('?scope=admin')).status,403);assert.equal((await post({scope:'admin'})).status,403);
 assert.equal((await post({},'https://evil.test')).status,403);
 assert.equal((await post({employee_nik:'X'})).status,403);assert.equal((await post({employee_nik:'R'})).status,403);
 assert.equal((await post({},'https://ops.test',0)).status,400);assert.equal((await post({},'https://ops.test',4)).status,400);
 assert.equal((await post({kind:'invalid'})).status,400);assert.equal((await post({incident_date:'2026-02-30'})).status,400);assert.equal((await post({coaching_details:'{}'})).status,400);
 let result=await(await post({employee_name:'Spoof',position:'Spoof',created_by:'evil'})).json();assert.equal(result.item.employee_name,'Kurir A');assert.equal(result.item.position,'Kurir Motor');assert.equal(result.item.created_by,session.email);assert.equal(result.item.recorder_name,'Leader A');assert.equal(result.item.coaching_details.targets,'Target');
 assert.equal((await post()).status,200);assert.equal(records.length,1,'stable ID prevents duplicates');
 assert.equal((await post({action:'update',updated_at:records[0].updated_at},'https://ops.test',0)).status,200);
 assert.equal(uploads,1,'Idempotent create retry must not reupload photos');assert.equal((await get('?type=photo&id='+id+'&index=0')).status,200);assert.equal((await get('?type=photo&id=22222222-2222-4222-8222-222222222222&index=0')).status,404);
 records.push({...records[0],id:'22222222-2222-4222-8222-222222222222',created_by:'other@test.invalid',recorder_name:''});
 assert.equal((await get('?type=photo&id=22222222-2222-4222-8222-222222222222&index=0')).status,404,'Other owner evidence stays private');
 assert.equal((await get('?type=record&id='+id)).status,200);assert.equal((await get('?type=record&id=22222222-2222-4222-8222-222222222222')).status,404);assert.equal((await post({id:'22222222-2222-4222-8222-222222222222',action:'update',updated_at:records[1].updated_at},'https://ops.test',0)).status,404);
 records[0].workflow_status='final';assert.equal((await post({action:'update',updated_at:records[0].updated_at},'https://ops.test',0)).status,409);records[0].workflow_status='awaiting_signatures';
 const own=(await(await get()).json());assert.equal(own.items.length,1,'PWA own records only');assert.equal(own.items[0].recorder_name,'Leader A');assert(own.items[0].photos[0].url.includes('type=photo'));assert(!Object.hasOwn(own.items[0].photos[0],'path'));assert.equal((await(await get('?type=employees')).json()).recorder_name,'Leader A');
 session={email:'admin@test.invalid',role:'admin'};owner=null;
 assert.equal((await get('?scope=admin&type=photo&id='+id+'&index=0')).status,200,'Admin can read evidence');
 assert.equal((await get()).status,403,'Admin without leadership uses dashboard scope');
 const all=(await(await get('?scope=admin')).json());assert.equal(all.items.length,2);assert.equal(all.items.find(r=>r.created_by==='other@test.invalid').recorder_name,'','Unlinked recorder must not fall back to email');assert.equal((await(await get('?scope=admin&type=employees')).json()).recorder_name,'');
 assert.equal((await post({scope:'admin',action:'update',updated_at:'2020-01-01'})).status,409);
 result=await(await post({scope:'admin',action:'update',employee_nik:'X',updated_at:records[0].updated_at,kind:'st',coaching_result:''})).json();assert.equal(result.item.employee_nik,'K','Identity snapshot immutable');assert.equal(result.item.kind,'st');
 session.role='super_admin';assert.equal((await get()).status,200);assert.equal((await(await get('?type=employees')).json()).items.length,people.filter(p=>p.active).length);
 owner=null;const superResult=await(await post({id:'77777777-7777-4777-8777-777777777777'})).json();assert.equal(superResult.item.recorder_name,'Superadmin');assert.equal(superResult.item.recorder_nik,null);
 for(const role of ['super_admin','spv']){session.role=role;assert.equal((await get('?scope=admin')).status,200)}
 for(const role of ['spv','jr_spv','admin']){session.role=role;owner=people[2];assert.equal((await get()).status,403,'Role alone must not grant PWA access');owner={...people[0],position:'Operational Inbound Jr. Supervisor'};assert.equal((await get()).status,200,'PWA authorization follows active employee position, not account role');assert.equal((await(await get('?type=employees')).json()).items.length,2,'Authorized supervisor remains limited to structural descendants');}
 owner=null;
 records[0].workflow_status='final';session.role='admin';assert.equal((await post({scope:'admin',action:'update',updated_at:records[0].updated_at})).status,409,'Final record cannot be edited');
 for(const role of ['jr_spv','coordinator','viewer']){session.role=role;assert.equal((await get('?scope=admin')).status,403)}
 session.role='admin';fail=true;assert.equal((await get('?scope=admin')).status,503);
 const source=fs.readFileSync('components/mobile-request-app.tsx','utf8');assert(source.includes('canRecordSanctions?'));assert(source.includes('pwa-service-grid-four'));assert(source.includes('/pwa-sanctions.png'));
 console.log('PASS: leadership hierarchy/NIK scope, staff denied, own history, admin roles, validation, spoof protection, retry safety, optimistic updates and PWA icon integration.');
})().catch(e=>{console.error(e);process.exitCode=1});
