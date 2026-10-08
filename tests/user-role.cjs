const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
let session={email:'root@example.test',role:'super_admin'},saveError=false,authError=false;
const user={id:'user-id',email:'staff@example.test',app_metadata:{role:'viewer',other:'preserved'}};let updates=[];
const db={auth:{admin:{listUsers:async()=>({data:{users:[user]},error:null}),updateUserById:async(id,payload)=>{if(authError)return{error:{message:'fail'}};updates.push(payload);user.app_metadata={...payload.app_metadata};return{data:{user},error:null};}}},from(){return{select(){return this},eq(){return this},maybeSingle:async()=>({data:{leader_name:'Divisi'},error:null}),upsert:async()=>({error:saveError?{message:'fail'}:null})}}};
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/admin/user-role/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:m.exports,module:m,require:n=>n==='@/lib/auth-token'?{SESSION_COOKIE:'jne_session',verifySessionToken:async()=>session}:n==='@/lib/supabase'?{getSupabaseServerClient:()=>db}:require(n),process:{env:{INTERNAL_SUPER_ADMIN_EMAIL:'primary@example.test'}}});
const post=(extra={},origin='http://localhost')=>m.exports.POST(new NextRequest('http://localhost/api/admin/user-role',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:user.email,role:'admin',previousRole:'viewer',...extra})}));
(async()=>{
 session=null;assert.equal((await post()).status,401);session={email:'manager@example.test',role:'admin'};assert.equal((await post()).status,403);
 session={email:'root@example.test',role:'super_admin'};assert.equal((await post({},'https://evil.test')).status,403);
 assert.equal((await post({role:'unknown'})).status,400);assert.equal((await post({email:'primary@example.test'})).status,400);assert.equal((await post({email:'root@example.test'})).status,400);
 assert.equal((await post({email:'missing@example.test'})).status,404);assert.equal((await post({previousRole:'admin'})).status,409);assert.equal(updates.length,0);
 let result=await(await post()).json();assert(result.ok);assert.equal(user.app_metadata.role,'admin');assert.equal(user.app_metadata.other,'preserved');assert(!JSON.stringify(updates).includes('password'));
 saveError=true;assert.equal((await post({previousRole:'admin',role:'viewer'})).status,503);assert.equal(user.app_metadata.role,'admin','Auth role rollback after database error');saveError=false;
 assert.equal((await post({previousRole:'admin',role:'spv'})).status,200);assert.equal(user.app_metadata.role,'spv');
 authError=true;assert.equal((await post({previousRole:'spv',role:'viewer'})).status,503);assert.equal(user.app_metadata.role,'spv');
 console.log('PASS: role update authorization, same-origin, valid role, primary/self protection, stale changes, metadata preservation, no password reset and rollback.');
})().catch(e=>{console.error(e);process.exitCode=1;});
