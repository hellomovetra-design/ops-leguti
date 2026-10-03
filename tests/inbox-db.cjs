// Run against an isolated PGlite installation: node tests/inbox-db.cjs <package-directory>
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { PGlite } = require(path.join(process.argv[2] || "@electric-sql/pglite"));
const db = new PGlite();
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await query(sql, params))[0];

(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table ops_users(email text primary key,role text);
    create table ops_user_profiles(email text primary key,display_name text);
    create table ops_employees(nik text primary key,name text);
    create table ops_user_employee_links(email text primary key,employee_nik text);
    create table ops_requests(id uuid primary key default gen_random_uuid(),type text,user_id text,shipment_numbers text,reason text,created_by text,status text default 'pending',rejection_reason text,created_at timestamptz default now());
    create table ops_problems(id uuid primary key default gen_random_uuid(),awb text,description text,created_by_email text,status text default 'open',status_note text,created_at timestamptz default now());
    insert into ops_users values('budi@example.test','admin'),('sari@example.test','super_admin'),('andi@example.test','viewer');
    insert into ops_employees values('1001','Andi Pratama'),('2001','Budi Santoso'),('2002','Sari Amelia');
    insert into ops_user_employee_links values('andi@example.test','1001'),('budi@example.test','2001'),('sari@example.test','2002');
    insert into ops_user_profiles values('andi@example.test','Outdated profile');
  `);
  await db.exec(fs.readFileSync("supabase/migrations/20261002_pwa_notifications.sql", "utf8"));
  await db.exec(fs.readFileSync("supabase/migrations/20261002_web_push.sql", "utf8"));
  await query("insert into ops_requests(type,user_id,reason,created_by) values('activation_user','TGR01','Old request','andi@example.test')");
  const migration = fs.readFileSync("supabase/migrations/20261003_request_inbox.sql", "utf8");
  await db.exec(migration);
  await db.exec(migration); // Reapplication must not duplicate conversations/cards.
  assert.equal(Number((await one("select count(*) n from ops_inbox_threads")).n), 1);
  assert.equal(Number((await one("select count(*) n from ops_inbox_messages")).n), 1);
  assert.equal(Number((await one("select count(*) n from ops_notifications")).n), 0);
  assert.equal((await one("select owner_name from ops_inbox_threads")).owner_name, "Andi Pratama");

  await db.exec(`insert into ops_push_subscriptions(recipient_email,endpoint_hash,endpoint,p256dh,auth) values
    ('budi@example.test','budi','https://fcm.googleapis.com/test-budi','test','test'),
    ('andi@example.test','andi','https://fcm.googleapis.com/test-andi','test','test');`);
  const request = await one("insert into ops_requests(type,user_id,reason,created_by) values('activation_user','TGR02','Please activate','andi@example.test') returning id");
  const thread = await one("select * from ops_inbox_threads where entity_id=$1", [request.id]);
  assert.equal(thread.owner_name, "Andi Pratama");
  const notices = await query("select * from ops_notifications where thread_id=$1", [thread.id]);
  assert.equal(notices.length, 2); assert(notices.every(row => row.kind === "inbox_request" && row.destination.endsWith(thread.id)));
  assert.equal(Number((await one("select count(*) n from ops_push_deliveries")).n), 1);

  const client = "33333333-3333-4333-8333-333333333333";
  const send = (email, name, isAdmin, body, id = client) => one("select ops_inbox_send($1,$2,$3,$4,$5,$6) message", [thread.id, email, name, isAdmin, body, id]);
  await send("budi@example.test", "Budi Santoso", true, "Oke bro, tunggu ya.");
  const first = await one("select first_admin_email,first_admin_name from ops_inbox_threads where id=$1", [thread.id]);
  assert.equal(first.first_admin_name, "Budi Santoso");
  await send("budi@example.test", "Budi Santoso", true, "Oke bro, tunggu ya.");
  assert.equal(Number((await one("select count(*) n from ops_inbox_messages where thread_id=$1", [thread.id])).n), 2);
  await send("sari@example.test", "Sari Amelia", true, "Saya bantu cek juga.");
  assert.equal((await one("select first_admin_name from ops_inbox_threads where id=$1", [thread.id])).first_admin_name, "Budi Santoso");
  const replies = await query("select * from ops_notifications where kind='inbox_reply'");
  assert.equal(replies.length, 2); assert(replies.every(row => row.recipient_email === "andi@example.test" && row.destination === "/pwa?inbox=" + thread.id));
  await assert.rejects(() => send("rina@example.test", "Rina", false, "Unauthorized"));
  const beforeUserReply = Number((await one("select count(*) n from ops_notifications")).n);
  await send("andi@example.test", "Andi Pratama", false, "Siap, makasih.");
  assert.equal(Number((await one("select count(*) n from ops_notifications")).n), beforeUserReply);

  const feed = await one("select ops_inbox_list('andi@example.test',false,0) feed");
  assert.equal(feed.feed.items.length, 2); assert.equal(feed.feed.unread, 2);
  const rina = await one("select ops_inbox_list('rina@example.test',false,0) feed"); assert.equal(rina.feed.items.length, 0);
  const seenSeq = (await one("select max(seq) seq from ops_inbox_messages where thread_id=$1", [thread.id])).seq;
  await query("select ops_inbox_mark_read($1,'andi@example.test',$2)", [thread.id, seenSeq]);
  assert.equal((await one("select ops_inbox_list('andi@example.test',false,0) feed")).feed.unread, 0);
  await query("select ops_inbox_mark_read($1,'andi@example.test',1)", [thread.id]);
  assert.equal((await one("select last_read_seq from ops_inbox_reads where thread_id=$1 and email='andi@example.test'", [thread.id])).last_read_seq, seenSeq);
  await send("budi@example.test", "Budi Santoso", true, "Sudah diproses.", "44444444-4444-4444-8444-444444444444");
  assert.equal((await one("select ops_inbox_list('andi@example.test',false,0) feed")).feed.unread, 1);
  const unReadReply = await one("select count(*) n from ops_notifications where thread_id=$1 and kind='inbox_reply' and read_at is null", [thread.id]); assert.equal(Number(unReadReply.n), 1);
  await query("update ops_requests set status='completed' where id=$1", [request.id]);
  assert.equal((await one("select status from ops_inbox_threads where id=$1", [thread.id])).status, "completed");
  const problem = await one("insert into ops_problems(awb,description,created_by_email) values('JNE01','Alamat kurang lengkap','andi@example.test') returning id");
  assert.equal((await one("select entity_type from ops_inbox_threads where entity_id=$1", [problem.id])).entity_type, "problem");
  await db.exec("set role anon");
  await assert.rejects(() => query("select * from ops_inbox_messages"));
  await assert.rejects(() => query("select ops_inbox_list('andi@example.test',true,0)"));
  await db.exec("reset role");
  const jobs = await query("select * from ops_claim_push_deliveries()");
  assert(jobs.some(job => job.destination.startsWith("/dashboard/ops-desk/inbox")));
  assert(jobs.some(job => job.destination.startsWith("/pwa?inbox=")));
  await db.close();
  console.log("PASS: SQL migration/reapply, quiet backfill, request/problem triggers, real names, first responder, idempotent send, scoped unread/read receipts, status sync, RLS/RPC denial and push routing (isolated PostgreSQL).");
})().catch(async error => { console.error(error); await db.close(); process.exitCode = 1; });
