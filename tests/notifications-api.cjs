const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict"),ts=require("typescript");
const {NextRequest}=require("next/server");
let session={email:"first@example.test",role:"viewer"},fail=false;
const first="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222";
const tables={ops_notifications:[{id:first,recipient_email:"first@example.test",entity_type:"request",entity_id:first,title:"Request dikonfirmasi admin",read_at:null},{id:other,recipient_email:"other@example.test",entity_type:"request",entity_id:other,read_at:null}],ops_requests:[{id:first,created_by:"first@example.test",status:"approved"},{id:other,created_by:"other@example.test",status:"completed"}]};
const db={from(table){let filters=[],patch=null,head=false,range=[0,999];const query={select(_fields,opts){head=!!opts?.head;return query},eq(k,v){filters.push(row=>row[k]===v);return query},is(k,v){filters.push(row=>row[k]===v);return query},order(){return query},range(a,b){range=[a,b];return query},update(body){patch=body;return query},maybeSingle(){return exec(true)},then(ok,no){return exec(false).then(ok,no)}};async function exec(single){if(fail)return {error:{message:"database unavailable"}};let rows=(tables[table]||[]).filter(row=>filters.every(f=>f(row)));const count=rows.length;rows=rows.slice(range[0],range[1]+1);if(patch)rows.forEach(row=>Object.assign(row,patch));return {error:null,data:head?null:single?rows[0]||null:rows.map(row=>({...row})),count}}return query}};
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync("app/api/notifications/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:name=>name==="@/lib/auth-token"?{SESSION_COOKIE:"jne_session",verifySessionToken:async()=>session}:name==="@/lib/supabase"?{getSupabaseServerClient:()=>db}:require(name),process:{env:{}},Date});
const get=q=>m.exports.GET(new NextRequest("http://localhost/api/notifications"+(q?"?"+q:""))),post=body=>m.exports.POST(new NextRequest("http://localhost/api/notifications",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}));
(async()=>{
let data=await(await get()).json();assert.equal(data.items.length,1);assert.equal(data.unread,1);assert.equal(data.items[0].id,first);
assert.equal((await get("notification_id="+other)).status,404);assert.equal((await get("notification_id=bad")).status,400);assert.equal((await get("offset=-1")).status,400);
assert.equal((await(await get("notification_id="+first)).json()).item.status,"approved");
let read=await(await post({action:"read",id:other})).json();assert.equal(read.ids.length,0);assert.equal(tables.ops_notifications[1].read_at,null);
assert.equal((await post({action:"write",recipient_email:"other@example.test"})).status,400);
read=await(await post({action:"read"})).json();assert.deepEqual(read.ids,[first]);assert(tables.ops_notifications[0].read_at);assert.equal(tables.ops_notifications[1].read_at,null);assert.equal((await(await get()).json()).unread,0);
tables.ops_requests=[];assert.equal((await get("notification_id="+first)).status,404);
fail=true;assert.equal((await get()).status,503);fail=false;session=null;assert.equal((await get()).status,401);assert.equal((await post({action:"read"})).status,401);
console.log("PASS: private notification feed/count/detail, no cross-account reads or writes, persistent mark-read, deleted entity, validation and auth failures.");
})().catch(e=>{console.error(e);process.exit(1)});
