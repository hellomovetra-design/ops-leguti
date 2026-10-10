const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
function load(file,mocks){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||require(n),process:{env:{SUPABASE_SERVICE_ROLE_KEY:'test'}},console,URL,Date,Response});return m.exports;}
const id='11111111-1111-4111-8111-111111111111';
let session={email:'owner@test.invalid',role:'viewer'},imageCalls=0;
const tables={ops_evidence_shares:[],ops_damage_cases:[{id,awb:'AWB1',created_by:session.email,photos:[{path:'imagekit:/damage/private.png',name:'secret-name',slot:3}]}],ops_problems:[{id,awb:'AWB2',created_by_email:session.email}],ops_problem_photos:[{id,problem_id:id,storage_path:'private/problem.png'}],ops_barkur:[{id,awb:'AWB3',created_by:'admin@test.invalid',evidence:[{path:'private/barkur.png',name:'secret-email'}]}]};
const db={from(table){let filters=[],update=null,upsert=null;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},is(k,v){filters.push(r=>r[k]===v);return q},order(){return q},update(value){update=value;return q},upsert(value){upsert=value;return q},maybeSingle:async()=>({data:tables[table].find(r=>filters.every(f=>f(r)))||null,error:null}),then(resolve,reject){try{let rows=tables[table].filter(r=>filters.every(f=>f(r)));if(update)rows.forEach(r=>Object.assign(r,update));if(upsert){const row=tables[table].find(r=>r.kind===upsert.kind&&r.record_id===upsert.record_id);if(row)Object.assign(row,upsert);else tables[table].push(upsert)}return Promise.resolve({data:rows,error:null}).then(resolve,reject)}catch(e){return Promise.reject(e).then(resolve,reject)}}};return q},storage:{from:bucket=>({download:async path=>{imageCalls++;return {data:new Blob(['image'],{type:'image/png'}),error:null}}})}};
const mocks={'@/lib/supabase':{getSupabaseServerClient:()=>db},'@/lib/auth-token':{SESSION_COOKIE:'session',verifySessionToken:async()=>session},'@/lib/imagekit':{fetchFromImageKit:async()=>{imageCalls++;return new Response('image',{headers:{'content-type':'image/png'}})}}};
const helpers=load('lib/evidence-share.ts',mocks);mocks['@/lib/evidence-share']=helpers;
const manage=load('app/api/evidence-shares/route.ts',mocks),pub=load('app/api/evidence/[token]/route.ts',mocks);
const post=(kind,action='create',origin='https://ops.test')=>manage.POST(new NextRequest('https://ops.test/api/evidence-shares',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({kind,id,action})}));
const get=(token,query='')=>pub.GET(new NextRequest(`https://ops.test/api/evidence/${token}${query}`),{params:Promise.resolve({token})});
(async()=>{
 assert(!helpers.validEvidenceToken(id));assert(!helpers.validEvidenceToken('a'.repeat(63)));assert(helpers.validEvidenceToken('a'.repeat(64)));
 assert.equal((await post('damage','create','https://evil.test')).status,403);
 session=null;assert.equal((await post('damage')).status,401);session={email:'other@test.invalid',role:'viewer'};assert.equal((await post('damage')).status,403);
 session={email:'owner@test.invalid',role:'viewer'};assert.equal((await post('barkur')).status,403);
 for(const kind of ['damage','problem','barkur']){
   session={email:'admin@test.invalid',role:'admin'};
   const response=await post(kind);assert.equal(response.status,200);const {url}=await response.json();const token=url.split('/').pop();assert(helpers.validEvidenceToken(token));
   assert.equal((await(await post(kind)).json()).url,url,'Stable active link');
   session=null;
   const metadata=await get(token);assert.equal(metadata.status,200);assert(metadata.headers.get('cache-control').includes('no-store'));
   const body=await metadata.json();assert.equal(body.photos.length,1);assert.deepEqual(Object.keys(body).sort(),['awb','photos','title']);assert(!JSON.stringify(body).includes('private'));assert(!JSON.stringify(body).includes('secret'));assert(!JSON.stringify(body).includes('@'));
   assert.equal((await get(token,'?photo=0')).status,200);assert.equal((await get(token,'?photo=99')).status,404);assert.equal((await get(token,'?photo=-1')).status,404);assert.equal((await get(token,'?photo=0.5')).status,404);
   session={email:'admin@test.invalid',role:'spv'};assert.equal((await post(kind,'revoke')).status,200);session=null;
   const calls=imageCalls;assert.equal((await get(token)).status,404);assert.equal((await get(token,'?photo=0')).status,404);assert.equal(imageCalls,calls,'Revoked links never reach storage');
   session={email:'admin@test.invalid',role:'super_admin'};const renewed=(await(await post(kind)).json()).url.split('/').pop();assert.notEqual(renewed,token);
   const table={damage:'ops_damage_cases',problem:'ops_problems',barkur:'ops_barkur'}[kind];tables[table]=[];session=null;assert.equal((await get(renewed)).status,404);assert.equal((await get(renewed,'?photo=0')).status,404);
 }
 assert.equal((await get(id)).status,404);assert.equal((await get('0'.repeat(64))).status,404);
 assert(fs.readFileSync('middleware.ts','utf8').includes('"/evidence/:path*"'));
 console.log('Public evidence: all 3 modules, anonymous access, ownership, CSRF, privacy, revocation and deletion passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
