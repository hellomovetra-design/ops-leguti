const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
function load(path,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,process:{env:{SUPABASE_SERVICE_ROLE_KEY:'test'}},require:n=>mocks[n]||require(n)});return m.exports;}
const damage=load('lib/damage-case.ts'),assets=load('lib/damage-assets.ts',{'./damage-case':damage});
const input={kind:'vehicle',value:' b9271ccg ',vehicle_code:' tgr132 ',vehicle_type:' cdd  long '};
const normalized=assets.damageAssetValues(input);assert.equal(normalized.fields.plate,'B 9271 CCG');assert.equal(normalized.fields.vehicle_code,'TGR132');assert.equal(normalized.fields.vehicle_type,'CDD LONG');
assert.equal(assets.damageAssetValues({...input,vehicle_code:' rental 27 '}).fields.vehicle_code,'RENTAL 27');
const warehouse=assets.damageAssetValues({kind:'warehouse',value:'  jne   mega hub  '});assert.equal(warehouse.fields.name,'JNE MEGA HUB');assert.equal(warehouse.fields.name_key,'JNEMEGAHUB');
for(const value of [{...input,value:'NOT A PLATE'},{...input,vehicle_code:''},{...input,vehicle_type:'<SCRIPT>'},{kind:'bad'},{kind:'warehouse',value:'-'},{kind:'warehouse',value:'A'.repeat(101)}])assert.throws(()=>assets.damageAssetValues(value));
let session={email:'admin@test',role:'admin'},stored=new Map(),writeError=false,readError=false,writes=0;
const db={from(table){let filter;return{async upsert(fields,options){assert(options.ignoreDuplicates);const key=table+':'+fields[options.onConflict];writes++;if(!stored.has(key)&&!writeError)stored.set(key,{...fields,active:true});return{error:writeError?{}:null};},select(){return this;},eq(key,value){filter=table+':'+value;return this;},async maybeSingle(){return{data:stored.get(filter),error:readError?{}:null};}};}};
const api=load('app/api/damage-assets/route.ts',{'@/lib/auth-token':{SESSION_COOKIE:'session',verifySessionToken:async()=>session},'@/lib/supabase':{getSupabaseServerClient:()=>db},'@/lib/damage-case':damage,'@/lib/damage-assets':assets});
const post=(body,origin='http://localhost')=>api.POST(new NextRequest('http://localhost/api/damage-assets',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}));
(async()=>{
 session=null;assert.equal((await post(input)).status,401);session={email:'staff@test',role:'viewer'};assert.equal((await post(input)).status,403);assert.equal(writes,0);
 for(const role of ['super_admin','admin','spv']){session={email:'admin@test',role};const response=await post(input);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal((await response.json()).item.plate,'B 9271 CCG');}
 assert.equal(stored.size,1);await post({...input,vehicle_code:'DIFFERENT'});assert.equal(stored.values().next().value.vehicle_code,'TGR132','Existing asset metadata remains unchanged');
 const before=writes;assert.equal((await post(input,'https://evil.test')).status,403);assert.equal(writes,before);
 const result=await post({kind:'warehouse',value:'jne mega hub'});assert.equal((await result.json()).item.plate,'JNE MEGA HUB');assert.equal(stored.size,2);
 stored.get('ops_damage_vehicle_master:B9271CCG').active=false;assert.equal((await post(input)).status,409);assert.equal(stored.get('ops_damage_vehicle_master:B9271CCG').active,false);
 assert.equal((await post({...input,value:'NO'})).status,400);writeError=true;assert.equal((await post(input)).status,503);writeError=false;readError=true;assert.equal((await post(input)).status,503);
 const ui=fs.readFileSync('components/damage-vehicle-picker.tsx','utf8');for(const snippet of ['data.can_create===true','canCreate&&query.trim()','assetLock.current','Simpan & pilih','toUpperCase()',"fetch('/api/damage-assets'"])assert(ui.includes(snippet),snippet);
 assert(ui.includes('<label>Keterangan aset<input'));assert(ui.includes('selectedAsset.vehicle_code'));assert(ui.includes('RENTAL / RENTAL 27 / TGR132'));
 console.log('PASS: uppercase/template normalization, required fleet metadata, admin roles, staff denial, CSRF, persistent unique assets, retries, inactive protection and write/read failures.');
})().catch(e=>{console.error(e);process.exitCode=1});
