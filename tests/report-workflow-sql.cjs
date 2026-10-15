const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('../.tmp/report-workflow-validation/node_modules/@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table ops_users(email text,role text,is_active boolean default true);
 insert into ops_users values('root@test','super_admin',true),('admin@test','admin',true),('spv@test','spv',true),('staff@test','viewer',true),('off@test','admin',false);
 create table ops_notifications(id uuid primary key default gen_random_uuid(),recipient_email text,kind text,entity_type text,entity_id uuid,title text,body text,status text,destination text);
 create table ops_damage_cases(id uuid primary key,awb text,status text default 'open',resolution text default '',created_by text,created_at timestamptz default now());
 create table ops_barkur(id uuid primary key,awb text,status text default 'open',resolution text default '',created_by text,created_at timestamptz default now());
 create table ops_problems(id uuid primary key default gen_random_uuid(),awb text,status text default 'open',status_note text default '',category text,description text,location text,division text,created_by_email text,created_at timestamptz default now());
 create table ops_problem_photos(id uuid primary key default gen_random_uuid(),problem_id uuid references ops_problems(id),storage_path text not null,file_name text,content_type text);
 insert into ops_damage_cases(id,awb,created_by) values('10000000-0000-4000-8000-000000000001','LEGACY','staff@test'),('10000000-0000-4000-8000-000000000002','LEGACY','staff@test');
 -- Simulate the existing inbox notification trigger before the new z-trigger.
 create function capture_problem() returns trigger language plpgsql as $$begin
 insert into ops_notifications(recipient_email,kind,entity_type,entity_id,title,status) select email,'inbox_request','problem',new.id,'Problem baru',new.status from ops_users where role in ('super_admin','admin') and is_active;
 return new;end$$;
 create trigger ops_problems_inbox after insert on ops_problems for each row execute function capture_problem();
 `);
 await db.exec(fs.readFileSync('supabase/migrations/20261015_report_workflow.sql','utf8'));
 // Re-applying is safe and does not fabricate history.
 await db.exec(fs.readFileSync('supabase/migrations/20261015_report_workflow.sql','utf8'));
 const rows=async(sql,params=[])=>(await db.query(sql,params)).rows;
 assert.equal((await rows('select count(*)::int n from ops_report_history'))[0].n,0);
 assert.equal((await rows('select count(*)::int n from ops_notifications'))[0].n,0);
 await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false);select set_config('request.headers','{"x-ops-actor":"admin@test"}',false);`);
 const damage='20000000-0000-4000-8000-000000000001';
 await db.query(`insert into ops_damage_cases(id,awb,created_by) values($1,' J T 123 ','staff@test')`,[damage]);
 assert.equal((await rows('select count(*)::int n from ops_notifications where entity_id=$1',[damage]))[0].n,3);
 assert.deepEqual((await rows('select actor_email,action from ops_report_history where entity_id=$1',[damage]))[0],{actor_email:'admin@test',action:'create'});
 assert.equal((await rows("select ops_report_awb_exists('damage','jt123',null) found"))[0].found,true);
 assert.equal((await rows("select ops_report_awb_exists('damage','jt123',$1) found",[damage]))[0].found,false);
 await assert.rejects(()=>db.query("insert into ops_damage_cases(id,awb,created_by) values(gen_random_uuid(),'jt123','staff@test')"),e=>e.code==='23505'&&e.message.includes('AWB_DUPLICATE'));
 await db.query("update ops_damage_cases set status='in_progress',resolution='Sedang diperiksa' where id=$1",[damage]);
 await db.query("update ops_damage_cases set resolution='Bukti tambahan diterima' where id=$1",[damage]);
 const history=await rows('select action,old_status,new_status,old_note,new_note from ops_report_history where entity_id=$1 order by created_at',[damage]);
 assert.equal(history.length,3);assert.equal(history[2].old_note,'Sedang diperiksa');assert.equal(history[2].new_note,'Bukti tambahan diterima');
 assert.equal((await rows("select count(*)::int n from ops_notifications where entity_id=$1 and recipient_email='staff@test'",[damage]))[0].n,1,'Only status changes notify the owner, not note-only edits');
 // Existing duplicate rows remain editable if AWB identity does not change.
 await db.exec("update ops_damage_cases set resolution='Legacy' where awb='LEGACY'");
 const problem='30000000-0000-4000-8000-000000000001';
 const values={awb:'JT123',category:'INVALID',description:'Rusak',location:'WH1',division:'Inbound'};
 const photos=[{storage_path:'imagekit:proof.jpg',file_name:'proof.jpg',content_type:'image/jpeg'}];
 await db.query('select ops_create_problem_report($1,$2,$3,$4)',[problem,JSON.stringify(values),JSON.stringify(photos),'staff@test']);
 assert.equal((await rows('select count(*)::int n from ops_problem_photos where problem_id=$1',[problem]))[0].n,1);
 assert.equal((await rows('select count(*)::int n from ops_notifications where entity_id=$1',[problem]))[0].n,3,'Existing inbox notices are not duplicated');
 await db.query('select ops_create_problem_report($1,$2,$3,$4)',[problem,JSON.stringify(values),JSON.stringify(photos),'staff@test']);
 assert.equal((await rows('select count(*)::int n from ops_problem_photos where problem_id=$1',[problem]))[0].n,1,'Idempotent retry');
 await assert.rejects(()=>db.query('select ops_create_problem_report($1,$2,$3,$4)',[problem,JSON.stringify(values),'[]','other@test']));
 const broken='30000000-0000-4000-8000-000000000002';
 await assert.rejects(()=>db.query('select ops_create_problem_report($1,$2,$3,$4)',[broken,JSON.stringify({...values,awb:'BROKEN'}),JSON.stringify([{file_name:'missing-path'}]),'staff@test']));
 assert.equal((await rows('select count(*)::int n from ops_problems where id=$1',[broken]))[0].n,0,'Photo error rolls back report');
 assert.equal((await rows('select count(*)::int n from ops_notifications where entity_id=$1',[broken]))[0].n,0,'Photo error rolls back notifications');
 assert.equal((await rows('select count(*)::int n from ops_report_history where entity_id=$1',[broken]))[0].n,0,'Photo error rolls back history');
 await db.exec(`select set_config('request.jwt.claims','{}',false);update ops_damage_cases set resolution='SQL change' where id='${damage}';`);
 assert.equal((await rows('select actor_email from ops_report_history where entity_id=$1 order by created_at desc limit 1',[damage]))[0].actor_email,null,'SQL does not impersonate an admin');
 await db.close();console.log('PASS: real PostgreSQL migration, reapply, legacy duplicates, normalized AWB guard, private history, note changes, correct attribution, three admin roles, no double notices, atomic report/photos and safe retries.');
})().catch(e=>{console.error(e);process.exit(1);});
