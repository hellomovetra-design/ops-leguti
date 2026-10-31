const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
let employee=null,profile={role:'super_admin',leader_name:'Ibad Narpatih'},fail=false;
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sanction-recorder.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:n=>n==='./employee-access'?{linkedEmployee:async()=>employee}:require(n)});
const db={from(){const q={select(){return q},eq(){return q},async maybeSingle(){return {data:profile,error:fail?{}:null}}};return q}};
(async()=>{
 const resolve=m.exports.sanctionRecorderIdentity,email='super@test',session={email,role:'super_admin'};
 let person=await resolve(db,email,session);assert.equal(person.name,'Ibad Narpatih');assert.equal(person.nik,null);
 profile.leader_name='';assert.equal((await resolve(db,email,session)).name,'Superadmin');profile.leader_name=email;assert.equal((await resolve(db,email,session)).name,'Superadmin');
 assert.equal(await resolve(db,email,{email,role:'viewer'}),null,'Do not promote current viewer using profile fallback');
 profile={role:'viewer',leader_name:'Other'};assert.equal(await resolve(db,'other@test',session),null,'Current superadmin cannot lend role to another creator');
 employee={nik:'00123',name:'Nama karyawan'};assert.equal((await resolve(db,email,session)).nik,'00123');
 employee=null;fail=true;await assert.rejects(()=>resolve(db,email,session),/belum dapat/);
 console.log('PASS: superadmin may use account profile without NIK, linked identity preferred, no email/name spoof, no privilege lending and lookup errors fail closed.');
})().catch(e=>{console.error(e);process.exitCode=1});
