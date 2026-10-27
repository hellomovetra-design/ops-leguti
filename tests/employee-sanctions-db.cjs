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
 await db.close();console.log('PASS: migration reapply, private tables, immutable identity, audit before/after, delete denied and coaching constraints.');
})().catch(e=>{console.error(e);process.exitCode=1});
