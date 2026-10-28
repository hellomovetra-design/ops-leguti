const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('../.tmp/report-workflow-validation/node_modules/@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table public.ops_employees(nik text primary key,name text not null,position text not null,dept text,hub text,level text,superior text,employment text,active boolean default true,tgrid text,created_at timestamptz default now());
 insert into ops_employees(nik,name,position,active) values('14060562','Joko Ariyanto','Inbound Delivery Leader',true),('10060062','Akh Sinjen','Inbound Delivery Leader',true),('12100278','Muhamad Bani Adam Arsyad','Inbound Delivery Leader',true),('12120295','Ahmad Syaripudin','Inbound Delivery Leader',true),('L1','Leader One','Inbound Delivery Leader',true),('L2','Leader Two','Inbound Delivery Leader',true);`);
 for(const file of ['20261002_courier_master_sync.sql','20261006_employee_hierarchy_nik.sql','20261008_employee_contacts_identity.sql','20261009_employee_employment_type.sql','20261010_personnel_history.sql','20261017_employee_courier_live_sync.sql','20261028_employee_bulk_merge.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 const merge=async(rows)=>(await one('select ops_merge_employee_batch($1,$2) result',[JSON.stringify(rows),'admin@test'])).result;
 await db.exec(`insert into ops_employees(nik,name,position,active,employment,tgrid,phone,email,employment_type,superior_nik) values
 ('A','Courier A','Kurir Motor Staff',true,'PKWTT','TGR999','081234567890','a@test','permanent','L1'),
 ('OMIT','Not Uploaded','Kurir Motor Staff',true,'Aktif','TGR998',null,null,'outsource','L1'),
 ('R','Resigned', 'Kurir Motor Staff',false,'Resign',null,null,null,'contract',null),
 ('I','Inactive', 'Kurir Motor Staff',false,'Nonaktif',null,null,null,'outsource',null);`);
 await db.exec("update ops_courier_master set area='AREA A',district='KEC A',shift='PAGI',vehicle='MOTOR',zone='Z1',kanit='KANIT A' where employee_nik='A'");
 let r=await merge([{nik:'A',name:'Courier A',superior:'Leader Two',position:'Kurir Mobil Staff',active:false,employment:'Nonaktif',phone:'changed',tgrid:'TGR111'}]);
 assert.deepEqual(r,{added:0,updated:1,unchanged:0,imported:1,deactivated:0});
 let a=await one("select * from ops_employees where nik='A'");assert.equal(a.active,true);assert.equal(a.employment,'PKWTT');assert.equal(a.phone,'081234567890');assert.equal(a.tgrid,'TGR999');assert.equal(a.superior_nik,'L2');
 let master=await one("select * from ops_courier_master where employee_nik='A'");assert.equal(master.leader_nik,'L2');assert.equal(master.area,'AREA A');assert.equal(master.shift,'PAGI');assert.equal(master.active,true);
 assert.equal((await one("select active from ops_employees where nik='OMIT'")).active,true);
 assert.equal((await one("select active from ops_courier_master where employee_nik='OMIT'")).active,true);
 const history=(await one('select count(*)::int n from ops_personnel_changes')).n;
 r=await merge([{nik:'A',name:'Courier A',superior:'Leader Two',position:'Kurir Mobil Staff',dept:''}]);assert.equal(r.unchanged,1);assert.equal((await one('select count(*)::int n from ops_personnel_changes')).n,history,'Unchanged upload must not write history');
 await merge([{nik:'R',name:'Resigned',active:true,employment:'Aktif'},{nik:'I',name:'Inactive',active:true},{nik:'NEW',name:'New courier',position:'Kurir Motor Staff',active:false}]);
 assert.equal((await one("select employment from ops_employees where nik='R'")).employment,'Resign');assert.equal((await one("select active from ops_employees where nik='I'")).active,false);assert.equal((await one("select active from ops_employees where nik='NEW'")).active,true);
 await merge([{nik:'L1',name:'Leader One',position:'Kurir Motor Staff',superior_nik:'L2'}]);assert.equal((await one("select active from ops_employees where nik='L1'")).active,true,'Demotion changes job, not employment status');
 await assert.rejects(()=>merge([{nik:'A',name:'Courier A',position:'BAD'},{nik:'BAD',name:'Bad',superior:'Unknown'}]));assert.equal((await one("select position from ops_employees where nik='A'")).position,'Kurir Mobil Staff','Entire failed batch rolled back');assert.equal((await one("select count(*)::int n from ops_employees where nik='BAD'")).n,0);
 await assert.rejects(()=>merge([{nik:'A',name:'One'},{nik:'A',name:'Two'}]));await assert.rejects(()=>merge([{nik:'MISSING'}]));
 await db.exec('set role authenticated');await assert.rejects(()=>merge([{nik:'A',name:'Spoof'}]));await db.exec('reset role');
 await db.exec(fs.readFileSync('supabase/migrations/20261028_employee_bulk_merge.sql','utf8'));
 await db.close();console.log('PASS: atomic partial bulk merge, no omitted deactivations, status/identity/contact preservation, NIK hierarchy, master live sync, unchanged skipped, rollback and permissions.');
})().catch(e=>{console.error(e);process.exitCode=1});
