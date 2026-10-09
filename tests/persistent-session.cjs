const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
function load(file,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||require(n),process:{env:{NODE_ENV:'production',INTERNAL_AUTH_SECRET:'x'.repeat(40)}},crypto:globalThis.crypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,Date,URL});return m.exports;}
// Cryptographic renewal tests run offline; production role lookup has its own suite.
const tokenModule={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/auth-token.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:tokenModule,exports:tokenModule.exports,process:{env:{NODE_ENV:'test'}},crypto:globalThis.crypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,Date});
const tokens=tokenModule.exports,policy=load('lib/access-policy.ts');
let session,renewals=0;
const mw=load('middleware.ts',{'@/lib/auth-token':{...tokens,verifySessionToken:async()=>session,createSessionToken:async(email,role,secret,nik)=>{renewals++;assert.equal(nik,'00123');return 'renewed';}},'@/lib/access-policy':policy});
(async()=>{
 const token=await tokens.createSessionToken('staff@example.test','viewer','x'.repeat(40),'00123');
 const payload=await tokens.verifySessionToken(token,'x'.repeat(40));
 assert.ok(payload.exp-Math.floor(Date.now()/1000)>364*86400);
 assert.equal(await tokens.verifySessionToken(token+'bad','x'.repeat(40)),null);
 session={...payload,exp:Math.floor(Date.now()/1000)+3600};
 let response=await mw.middleware(new NextRequest('https://ops.movetra.id/pwa'));
 assert.equal(response.cookies.get(tokens.SESSION_COOKIE).value,'renewed');
 assert.equal(response.cookies.get(tokens.SESSION_COOKIE).maxAge,tokens.SESSION_MAX_AGE);
 assert.match(response.headers.get('set-cookie'),/HttpOnly/);assert.match(response.headers.get('set-cookie'),/Secure/);
 session=payload;response=await mw.middleware(new NextRequest('https://ops.movetra.id/pwa'));
 assert.equal(response.cookies.get(tokens.SESSION_COOKIE),undefined);assert.equal(renewals,1);
 session=null;response=await mw.middleware(new NextRequest('https://ops.movetra.id/pwa'));
 assert.equal(response.status,307);assert.equal(response.cookies.get(tokens.SESSION_COOKIE),undefined);
 const logout=load('app/api/auth/logout/route.ts',{'@/lib/auth-token':tokens});
 response=await logout.POST();assert.equal(response.cookies.get(tokens.SESSION_COOKIE).maxAge,0);
 console.log('PASS: persistent signed session, tamper rejection, renewal of short/old sessions, no renewal churn, anonymous redirect and explicit logout.');
})().catch(e=>{console.error(e);process.exitCode=1});
