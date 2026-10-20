const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
let session=null,reads=0;
const mocks={'@/lib/auth-token':{SESSION_COOKIE:'session',verifySessionToken:async()=>session},'@/lib/supabase':{getSupabaseServerClient:()=>{reads++;throw Error('Unauthorized request reached database');}}};
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/ops-desk/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||(n.startsWith('@/')?{}:require(n)),process,console});
const get=(type,view='')=>m.exports.GET(new NextRequest(`https://ops.test/api/ops-desk?type=${type}&view=${view}`));
(async()=>{
 assert.equal((await get('employees','template')).status,401);
 session={email:'staff@test.invalid',role:'viewer'};
 for(const view of ['', 'summary','structure','export','template']) assert.equal((await get('employees',view)).status,403);
 assert.equal((await get('overview')).status,403);
 assert.equal((await get('unknown')).status,400);
 assert.equal(reads,0);
 for(const role of ['admin','super_admin','spv','coordinator','jr_spv']){
  session={email:'manager@test.invalid',role};
  const response=await get('employees','template');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
 }
 assert.equal(fs.existsSync('public/struktur update 2026_SEPT.xlsx'),false);
 console.log('PASS: anonymous/staff data access blocked before DB; template protected for dashboard roles, public workbook removed.');
})().catch(e=>{console.error(e);process.exitCode=1});
