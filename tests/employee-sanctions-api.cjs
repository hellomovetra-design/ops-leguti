const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
function load(file,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||require(n),process:{env:{}},URL,Date,console});return m.exports}
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
const db={from(table){let filters=[],body,mode='select',bounds=[0,999];const q={select(){return q},order(){return q},range(a,b){bounds=[a,b];return q},eq(k,v){filters.push(r=>r[k]===v);return q},ilike(){return q},insert(v){body=v;mode='insert';return q},update(v){body=v;mode='update';return q},maybeSingle(){return exec(true)},single(){return exec(true)},then(resolve,reject){return exec(false).then(resolve,reject)}};
async function exec(single){if(fail)return{error:{code:'42P01'}};const source=table==='ops_employees'?people:records;let rows=source.filter(r=>filters.every(f=>f(r)));if(mode==='insert'){if(records.some(r=>r.id===body.id))return{error:{code:'23505'}};const row={...body,created_at:'2026-10-27T00:00:00Z',updated_at:'2026-10-27T00:00:00Z'};records.push(row);return{data:row};}if(mode==='update')rows.forEach(r=>Object.assign(r,body,{updated_at:'2026-10-27T01:00:00Z'}));return{data:single?rows[0]||null:rows.slice(bounds[0],bounds[1]+1)}}return q}};
const api=load('app/api/employee-sanctions/route.ts',{'@/lib/auth-token':{SESSION_COOKIE:'session',verifySessionToken:async()=>session},'@/lib/supabase':{getSupabaseServerClient:()=>db},'@/lib/employee-access':{linkedEmployee:async()=>owner},'@/lib/employee-sanctions':model,'@/lib/employee-status':status});
const id='11111111-1111-4111-8111-111111111111';
const get=q=>api.GET(new NextRequest('https://ops.test/api/employee-sanctions'+(q||'')));
const post=(extra={},origin='https://ops.test')=>api.POST(new NextRequest('https://ops.test/api/employee-sanctions',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({id,action:'create',scope:'mine',employee_nik:'K',kind:'coaching',description:'Catatan test',coaching_result:'Hasil test',incident_date:'2026-10-27',...extra})}));
(async()=>{
 session=null;assert.equal((await get()).status,401);assert.equal((await post()).status,401);session={email:'leader@test.invalid',role:'viewer'};
 owner=people[2];assert.equal((await get()).status,403);assert.equal((await post()).status,403);owner=people[1];
 assert.equal((await get('?scope=admin')).status,403);assert.equal((await post({scope:'admin'})).status,403);
 assert.equal((await post({},'https://evil.test')).status,403);
 assert.equal((await post({employee_nik:'X'})).status,403);assert.equal((await post({employee_nik:'R'})).status,403);
 assert.equal((await post({kind:'invalid'})).status,400);assert.equal((await post({incident_date:'2026-02-30'})).status,400);assert.equal((await post({coaching_result:''})).status,400);
 let result=await(await post({employee_name:'Spoof',position:'Spoof',created_by:'evil'})).json();assert.equal(result.item.employee_name,'Kurir A');assert.equal(result.item.position,'Kurir Motor');assert.equal(result.item.created_by,session.email);
 assert.equal((await post()).status,200);assert.equal(records.length,1,'stable ID prevents duplicates');
 assert.equal((await post({action:'update',updated_at:records[0].updated_at})).status,403);
 records.push({...records[0],id:'22222222-2222-4222-8222-222222222222',created_by:'other@test.invalid'});
 assert.equal((await(await get()).json()).items.length,1,'PWA own records only');
 session={email:'admin@test.invalid',role:'admin'};owner=null;
 assert.equal((await get()).status,403,'Admin without leadership uses dashboard scope');
 assert.equal((await(await get('?scope=admin')).json()).items.length,2);
 assert.equal((await post({scope:'admin',action:'update',updated_at:'2020-01-01'})).status,409);
 result=await(await post({scope:'admin',action:'update',employee_nik:'X',updated_at:records[0].updated_at,kind:'st',coaching_result:''})).json();assert.equal(result.item.employee_nik,'K','Identity snapshot immutable');assert.equal(result.item.kind,'st');
 session.role='super_admin';assert.equal((await get()).status,200);assert.equal((await(await get('?type=employees')).json()).items.length,people.filter(p=>p.active).length);
 for(const role of ['super_admin','spv']){session.role=role;assert.equal((await get('?scope=admin')).status,200)}
 for(const role of ['spv','jr_spv','admin']){session.role=role;owner=people[2];assert.equal((await get()).status,403,'Role alone must not grant PWA access');owner={...people[0],position:'Operational Inbound Jr. Supervisor'};assert.equal((await get()).status,200,'PWA authorization follows active employee position, not account role');assert.equal((await(await get('?type=employees')).json()).items.length,2,'Authorized supervisor remains limited to structural descendants');}
 owner=null;
 for(const role of ['jr_spv','coordinator','viewer']){session.role=role;assert.equal((await get('?scope=admin')).status,403)}
 session.role='admin';fail=true;assert.equal((await get('?scope=admin')).status,503);
 const source=fs.readFileSync('components/mobile-request-app.tsx','utf8');assert(source.includes('canRecordSanctions?'));assert(source.includes('pwa-service-grid-four'));assert(source.includes('/pwa-sanctions.png'));
 console.log('PASS: leadership hierarchy/NIK scope, staff denied, own history, admin roles, validation, spoof protection, retry safety, optimistic updates and PWA icon integration.');
})().catch(e=>{console.error(e);process.exitCode=1});
