const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.argv[2]||'@electric-sql/pglite');
(async()=>{
 const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role;');
 const migration=fs.readFileSync('supabase/migrations/20261027_employee_sanctions.sql','utf8');await db.exec(migration);await db.exec(migration);
 const id='11111111-1111-4111-8111-111111111111';
 await db.query(`insert into ops_employee_sanctions(id,employee_nik,employee_name,kind,incident_date,description,coaching_result,created_by,updated_by) values($1,'N1','Nama','coaching','2026-10-27','Catatan','Hasil','leader@test','leader@test')`,[id]);
 let result=await db.query('select * from ops_employee_sanction_history');assert.equal(result.rows.length,1);assert.equal(result.rows[0].before_data,null);
 await db.query(`update ops_employee_sanctions set employee_nik='OTHER',created_by='OTHER',description='Koreksi',updated_by='admin@test' where id=$1`,[id]);
 result=await db.query('select * from ops_employee_sanctions');assert.equal(result.rows[0].employee_nik,'N1');assert.equal(result.rows[0].created_by,'leader@test');assert.equal(result.rows[0].description,'Koreksi');
 result=await db.query('select * from ops_employee_sanction_history order by id');assert.equal(result.rows.length,2);assert.equal(result.rows[1].before_data.description,'Catatan');assert.equal(result.rows[1].after_data.description,'Koreksi');
 for(const role of ['anon','authenticated']){
  await db.exec(`set role ${role}`);await assert.rejects(db.query('select * from ops_employee_sanctions'),/permission denied/);await assert.rejects(db.query('select * from ops_employee_sanction_history'),/permission denied/);await db.exec('reset role');
 }
 await db.exec('set role service_role');await assert.rejects(db.query('delete from ops_employee_sanctions'),/permission denied/);await assert.rejects(db.query('delete from ops_employee_sanction_history'),/permission denied/);await db.exec('reset role');
 await assert.rejects(db.query(`update ops_employee_sanctions set coaching_result='' where id=$1`,[id]),/check constraint/);
 const evidence=fs.readFileSync('supabase/migrations/20261028_sanction_photos.sql','utf8');await db.exec(evidence);await db.exec(evidence);
 assert.equal((await db.query('select photos from ops_employee_sanctions')).rows[0].photos.length,0,'Legacy record remains readable');
 await assert.rejects(db.query(`update ops_employee_sanctions set description='No proof' where id=$1`,[id]),/minimal 1 foto/);
 const photos=[{name:'Proof.jpg',path:'sanctions/test.jpg',fileId:'f1',content_type:'image/jpeg'}];
 await db.query('update ops_employee_sanctions set photos=$1::jsonb where id=$2',[JSON.stringify(photos),id]);
 await assert.rejects(db.query('update ops_employee_sanctions set photos=$1::jsonb where id=$2',[JSON.stringify([...photos,...photos,...photos,...photos]),id]),/check constraint/);
 await assert.rejects(db.query("update ops_employee_sanctions set photos='[]' where id=$1",[id]),/minimal 1 foto/);
 result=await db.query('select * from ops_employee_sanction_history order by id desc limit 1');assert.equal(result.rows[0].before_data.photos.length,0);assert.equal(result.rows[0].after_data.photos.length,1,'Evidence metadata is audited');
 await db.close();console.log('PASS: private tables, immutable identity, audit before/after with evidence, delete denied, legacy read, required 1–3 photos and migration reapply.');
})().catch(e=>{console.error(e);process.exitCode=1});
