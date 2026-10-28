const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('../.tmp/report-workflow-validation/node_modules/@electric-sql/pglite');
const repair=fs.readFileSync('supabase/repairs/20261028_recover_bulk_deactivation.sql','utf8');
async function fixture(){
 const db=new PGlite();
 await db.exec(`create table ops_courier_master_revision(singleton boolean);insert into ops_courier_master_revision values(true);
 create table ops_audit_logs(id uuid,action text,entity_type text,metadata jsonb,created_at timestamptz);
 insert into ops_audit_logs values('8f5f3f65-bb02-41d1-83bc-0624ada6eba2','bulk_upsert','employee','{"rows":84}','2026-10-28 03:55:20.049465+00');
 create table ops_employees(nik text primary key,active boolean,employment text);
 create table ops_personnel_changes(id uuid default gen_random_uuid(),employee_nik text,transaction_id bigint,action text,before_data jsonb,after_data jsonb,created_at timestamptz);
 insert into ops_employees select 'BROKEN'||i,false,'Nonaktif' from generate_series(1,221) i;
 insert into ops_personnel_changes(employee_nik,transaction_id,action,before_data,after_data,created_at)
 select nik,36405,'update',jsonb_build_object('nik',nik,'active',true,'employment','PKWTT'),to_jsonb(e),'2026-10-28 03:55:18.045946+00' from ops_employees e;
 insert into ops_employees select 'ACTIVE'||i,true,'Aktif' from generate_series(1,84) i;
 insert into ops_employees select 'OLD-INACTIVE'||i,false,'Nonaktif' from generate_series(1,10) i;`);
 return db;
}
(async()=>{
 let db=await fixture();await db.exec(repair);
 let r=(await db.query('select count(*) filter(where active)::int active,count(*) filter(where not active)::int inactive from ops_employees')).rows[0];assert.deepEqual(r,{active:305,inactive:10});
 assert.equal((await db.query("select employment from ops_employees where nik='BROKEN1'")).rows[0].employment,'PKWTT','Restore exact previous status');
 await assert.rejects(()=>db.exec(repair),/seharusnya 221/);await db.exec('rollback');await db.close();
 db=await fixture();await db.exec("insert into ops_personnel_changes(employee_nik,created_at) values('BROKEN1','2026-10-28 04:00:00+00')");
 await assert.rejects(()=>db.exec(repair),/seharusnya 221/);await db.exec('rollback');assert.equal((await db.query('select count(*)::int n from ops_employees where active')).rows[0].n,84,'Later edits abort entire repair');await db.close();
 console.log('PASS: incident-only recovery restores 221 original statuses, preserves ten preexisting inactive employees, refuses rerun and aborts on later edits.');
})().catch(e=>{console.error(e);process.exitCode=1});
