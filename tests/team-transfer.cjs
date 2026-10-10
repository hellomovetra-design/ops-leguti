const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
let session={email:'admin@test',role:'admin'},calls=[],error=null;
const people=Array.from({length:1001},(_,i)=>({nik:String(i),name:'Person '+i}));
const db={from(table){assert.equal(table,'ops_employees');const query={select(){return query},order(){return query},range:async(a,b)=>({data:people.slice(a,b+1),error:null})};return query;},rpc:async(name,payload)=>{calls.push({name,payload});return {data:payload.p_apply?{ok:true,count:1}:{source:{nik:'one'},target:{nik:'two'},members:[{nik:'child'}]},error};}};
const moduleMock={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/team-transfer/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:moduleMock,exports:moduleMock.exports,process:{env:{SUPABASE_SERVICE_ROLE_KEY:'test'}},require:n=>n==='@/lib/auth-token'?{SESSION_COOKIE:'session',verifySessionToken:async()=>session}:n==='@/lib/supabase'?{getSupabaseServerClient:actor=>{assert.equal(actor,session.email);return db;}}:require(n)});
const api=moduleMock.exports;
const get=(query='')=>api.GET(new NextRequest('http://localhost/api/team-transfer'+query));
const post=(body,origin='http://localhost')=>api.POST(new NextRequest('http://localhost/api/team-transfer',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}));
(async()=>{
 session=null;assert.equal((await get()).status,401);session={email:'staff@test',role:'viewer'};assert.equal((await get()).status,403);assert.equal((await post({})).status,403);
 for(const role of ['super_admin','admin','spv']){session={email:'admin@test',role};const response=await get();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal((await response.json()).items.length,1001);}
 const preview=await(await get('?from=one&to=two')).json();assert.equal(preview.members[0].nik,'child');assert.equal(calls.at(-1).payload.p_apply,false);
 const body={from:'one',to:'two',members:preview.members,expected:{source:preview.source,target:preview.target}};
 const before=calls.length;assert.equal((await post(body,'https://evil.test')).status,403);assert.equal(calls.length,before);
 for(const invalid of [{...body,to:'one'},{...body,members:[]},{...body,expected:null},{...body,from:1}])assert.equal((await post(invalid)).status,400);
 assert.equal((await post(body)).status,200);assert.equal(calls.at(-1).payload.p_apply,true);assert.equal(calls.at(-1).payload.p_members[0].nik,'child');
 error={message:'Data anggota berubah. Muat ulang pratinjau.'};assert.equal((await post(body)).status,409);error={code:'PGRST202'};assert((await(await get('?from=one&to=two')).json()).error.includes('20261010_transfer_team.sql'));
 const sql=fs.readFileSync('supabase/migrations/20261010_transfer_team.sql','utf8');
 for(const snippet of ['for update','to_jsonb(member) is distinct from selection','p_expected','team @>','ops_resolve_superior_nik','superior_nik=p_to','leader_nik=leader_id','ops_courier_master_changes','revision=revision+1','from public,anon,authenticated'])assert(sql.includes(snippet),snippet);
 assert(!/set .*\b(area|shift|vehicle|district|zone|kanit|active|position)=/.test(sql),'Placement attributes and roles must not be overwritten');
 const ui=fs.readFileSync('components/team-transfer.tsx','utf8');assert(ui.includes('Muat ulang pratinjau'));assert(ui.includes('setConfirmed(false)'));assert(ui.includes('expected:{source:preview.source,target:preview.target}'));assert(ui.includes('lock.current'));
 assert(fs.readFileSync('components/employee-admin.tsx','utf8').includes('<TeamTransfer'));
 console.log('PASS: transfer API auth/roles, CSRF, full pagination, preview/confirmation, stale/missing SQL handling, SQL safety and UI wiring. SQL not executed against a live database.');
})().catch(e=>{console.error(e);process.exitCode=1});
