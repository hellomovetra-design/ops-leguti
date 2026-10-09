const fs = require("node:fs"), vm = require("node:vm"), assert = require("node:assert/strict"), ts = require("typescript");
const { NextRequest } = require("next/server");
const own = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222", client = "33333333-3333-4333-8333-333333333333";
let session = { email: "andi@example.test", role: "viewer" }, unavailable = false;
const threads = [{ id: own, owner_email: "andi@example.test" }, { id: other, owner_email: "rina@example.test" }];
const messages = Array.from({ length: 40 }, (_, index) => ({ id: `m-${index}`, seq: index + 1, thread_id: own, sender_email: "budi@example.test", sender_name: "Budi Santoso", kind: "message", body: `Message ${index}` }));
const calls = [];
const db = {
  from(table) {
    let filters = [], limit = Infinity, descending = false;
    const query = {
      select() { return query; }, eq(key, value) { filters.push(row => row[key] === value); return query; },
      lt(key, value) { filters.push(row => row[key] < value); return query; },
      order(_, options) { descending = !options.ascending; return query; }, limit(value) { limit = value; return query; },
      maybeSingle() { return run(true); }, then(ok, no) { return run(false).then(ok, no); },
    };
    async function run(single) {
      if (unavailable) return { error: { message: "missing migration" } };
      let rows = (table === "ops_inbox_threads" ? threads : messages).filter(row => filters.every(filter => filter(row)));
      if (descending) rows = [...rows].sort((a, b) => b.seq - a.seq);
      return { data: single ? rows[0] || null : rows.slice(0, limit), error: null };
    }
    return query;
  },
  async rpc(name, params) {
    calls.push({ name, params });
    if (unavailable) return { error: { message: "missing migration" } };
    if (name === "ops_inbox_list") return { data: { items: threads.filter(row => params.p_admin || row.owner_email === params.p_email), unread: 2 }, error: null };
    if (name === "ops_inbox_account_name") return { data: "Andi Pratama", error: null };
    if (name === "ops_inbox_send_fast") {
      const thread=threads.find(row=>row.id===params.p_thread);
      if (!thread || (!params.p_admin && thread.owner_email!==params.p_email)) return { error: { code: "P0002" } };
      return { data: { id: "saved" }, error: null };
    }
    return { data: { id: "saved" }, error: null };
  },
};
function load(file, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => dependencies[name] || require(name), process: { env: { SUPABASE_SERVICE_ROLE_KEY: "test-only" } }, performance, console });
  return module.exports;
}
const inbox = load("lib/inbox.ts", {});
const route = load("app/api/inbox/route.ts", {
  "@/lib/auth-token": { SESSION_COOKIE: "session", verifySessionToken: async () => session },
  "@/lib/supabase": { getSupabaseServerClient: () => db }, "@/lib/inbox": inbox,
  "@/lib/web-push": { dispatchPush: async () => {} },
  "next/server": { ...require("next/server"), after: () => {} },
});
const get = query => route.GET(new NextRequest("http://localhost/api/inbox?" + (query || "scope=user")));
const post = (body, origin = "http://localhost") => route.POST(new NextRequest("http://localhost/api/inbox", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) }));
(async () => {
  let response = await get(), data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.items.length, 1); assert.equal(data.items[0].id, own);
  assert.equal((await get("scope=admin")).status, 403);
  assert.equal((await get("scope=user&thread_id=" + other)).status, 404);
  assert.equal((await get("scope=user&thread_id=bad")).status, 400);
  assert.equal((await get("scope=user&offset=-1")).status, 400);
  data = await (await get("scope=user&thread_id=" + own)).json();
  assert.equal(data.messages.length, 30); assert.equal(data.messages[0].seq, 11); assert.equal(data.messages.at(-1).seq, 40); assert.equal(data.more_messages, true);
  data = await (await get(`scope=user&thread_id=${own}&before=11`)).json(); assert.equal(data.messages.length, 10); assert.equal(data.more_messages, false);
  assert.equal((await get("scope=user&before=11")).status, 400);
  const send = { action: "send", scope: "user", thread_id: own, body: "  Siap bro  ", client_id: client, sender_name: "Fake admin", sender_email: "evil@example.test", sender_role: "admin" };
  assert.equal((await post(send, "https://evil.test")).status, 403);
  assert.equal((await post({ ...send, thread_id: other })).status, 404);
  assert.equal((await post({ ...send, body: " " })).status, 400);
  assert.equal((await post({ ...send, body: "x".repeat(2001) })).status, 400);
  assert.equal((await post({ ...send, client_id: "bad" })).status, 400);
  assert.equal((await post(send)).status, 200);
  const saved = calls.filter(call => call.name === "ops_inbox_send_fast").at(-1).params;
  assert.equal(saved.p_email, session.email); assert.equal(saved.p_name, undefined); assert.equal(saved.p_admin, false); assert.equal(saved.p_body, "Siap bro"); assert.equal(saved.p_client, client);
  assert.equal((await post({ action: "read", scope: "user", thread_id: other, seq: 40 })).status, 404);
  assert.equal((await post({ action: "read", scope: "user", thread_id: own, seq: -1 })).status, 400);
  assert.equal((await post({ action: "read", scope: "user", thread_id: own, seq: 40 })).status, 200);
  session = { email: "budi@example.test", role: "admin" };
  data = await (await get("scope=admin")).json(); assert.equal(data.items.length, 2);
  assert.equal((await get("scope=user&thread_id=" + own)).status, 404);
  assert.equal((await post({ ...send, scope: "admin" })).status, 200);
  assert.equal(calls.filter(call => call.name === "ops_inbox_send_fast").at(-1).params.p_admin, true);
  session = { email: "spv@example.test", role: "spv" };
  assert.equal((await get("scope=admin")).status,200);
  assert.equal((await post({ ...send, scope: "admin" })).status,200);
  unavailable = true; assert.equal((await get("scope=admin")).status, 503); unavailable = false;
  session = null; assert.equal((await get()).status, 401); assert.equal((await post(send)).status, 401);
  console.log("PASS: Inbox account isolation, admin permissions, sender spoof rejection, origin, pagination, sequence receipts, message validation, auth and missing-schema handling.");
})().catch(error => { console.error(error); process.exitCode = 1; });
