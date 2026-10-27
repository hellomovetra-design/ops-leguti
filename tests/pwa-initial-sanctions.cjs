const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
let session={email:'super@test',role:'super_admin'},person=null,lookup=0,fail=false;
const m={exports:{}};
const mocks={'next/headers':{cookies:async()=>({get:()=>({value:'cookie'})})},'next/navigation':{redirect:()=>{throw Error('LOGIN')}},'@/lib/auth-token':{SESSION_COOKIE:'session',verifySessionToken:async()=>session},'@/lib/supabase':{getSupabaseServerClient:()=>({})},'@/lib/employee-access':{linkedEmployee:async()=>{lookup++;if(fail)throw Error();return person}},'@/lib/employee-sanctions':{sanctionRecorder:p=>!!p?.active&&/leader|coordinator|koordinator|supervisor|spv/i.test(p.position)},'@/components/mobile-request-app':{MobileRequestApp:()=>null}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/pwa/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||require(n),process:{env:{}}});
(async()=>{
 assert.equal((await m.exports.default()).props.initialCanRecordSanctions,true);assert.equal(lookup,0);
 session={email:'staff@test',role:'viewer'};
 for(const position of ['Leader','Koordinator','Operational Jr. Supervisor','SPV']){person={active:true,position};assert.equal((await m.exports.default()).props.initialCanRecordSanctions,true)}
 person={active:true,position:'Kurir Motor'};assert.equal((await m.exports.default()).props.initialCanRecordSanctions,false);
 person={active:false,position:'Leader'};assert.equal((await m.exports.default()).props.initialCanRecordSanctions,false);
 fail=true;assert.equal((await m.exports.default()).props.initialCanRecordSanctions,false);
 session=null;await assert.rejects(m.exports.default(),/LOGIN/);
 const source=fs.readFileSync('components/mobile-request-app.tsx','utf8');assert(source.includes('useState(initialCanRecordSanctions)'));assert(source.includes('setCanRecordSanctions(data.profile?.can_record_sanctions===true)'));
 console.log('PASS: initial server-rendered icon permission matches account, superadmin skips employee lookup, staff/inactive/failures denied and profile still revalidates.');
})().catch(e=>{console.error(e);process.exitCode=1});
