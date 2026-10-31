const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('../.tmp/db-check/node_modules/@electric-sql/pglite');
(async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role;');
 await db.exec("create table ops_test_secret(value integer);insert into ops_test_secret values(7);grant select on ops_test_secret to anon,authenticated;create function ops_test_leak() returns integer language sql security definer as 'select value from ops_test_secret limit 1';create table ops_test_audit(id integer);revoke all on ops_test_audit from public,service_role;grant select,insert on ops_test_audit to service_role;");
 const sql=fs.readFileSync('supabase/migrations/20261031_dashboard_mfa.sql','utf8');await db.exec(sql);await db.exec(sql);
 assert.equal((await db.query("select has_function_privilege('anon','ops_test_leak()','execute') as ok")).rows[0].ok,false);
 assert.equal((await db.query("select has_table_privilege('service_role','ops_test_audit','delete') as ok")).rows[0].ok,false,'Audit append-only grants must not expand');
 const user='11111111-1111-4111-8111-111111111111',first='22222222-2222-4222-8222-222222222222',factor='33333333-3333-4333-8333-333333333333';
 async function add(id,email='admin@test'){await db.query("insert into ops_mfa_login_challenges(id,user_id,email,expires_at,factor_id) values($1,$2,$3,now()+interval '10 minutes',$4)",[id,user,email,factor]);}
 const claim=id=>db.query('select ops_claim_mfa_attempt($1,$2) as ok',[id,'admin@test']);
 await add(first);for(let i=0;i<5;i++)assert.equal((await claim(first)).rows[0].ok,true);assert.equal((await claim(first)).rows[0].ok,false);
 const second='44444444-4444-4444-8444-444444444444';await add(second);for(let i=0;i<5;i++)assert.equal((await claim(second)).rows[0].ok,true);
 const third='55555555-5555-4555-8555-555555555555';await add(third);assert.equal((await claim(third)).rows[0].ok,false,'New password login cannot reset account-wide attempt budget');
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from ops_mfa_login_challenges'),/permission denied/);await assert.rejects(db.query('select * from ops_test_secret'),/permission denied/);await assert.rejects(claim(first),/permission denied/);await db.exec('reset role');}
 await db.query("update ops_mfa_login_challenges set consumed_at=now() where id=$1",[third]);assert.equal((await claim(third)).rows[0].ok,false);
 console.log('PASS: MFA challenge RLS, service-only RPC, atomic per-challenge/account limits, no counter reset by new challenge, consumed nonce denial and reapply.');
 }finally{await db.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
