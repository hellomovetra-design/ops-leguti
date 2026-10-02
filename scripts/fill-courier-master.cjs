// Administrator-authorised initial enrichment from KURIR only. Default is read-only.
// Preserve existing names/NIK and never interpret Sheet2 or missing rows as employee replacements.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),X=require('xlsx');
process.loadEnvFile('.env.local');
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/courier-master.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports});
const core=m.exports,{createClient}=require('@supabase/supabase-js');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
async function all(table){const rows=[];for(let n=0;;n+=1000){const r=await db.from(table).select('*').order('tgrid').range(n,n+999);if(r.error)throw new Error(r.error.message);rows.push(...r.data);if(r.data.length<1000)return rows;}}
(async()=>{
 const file=process.argv[2];if(!file)throw new Error('Provide original .xlsx path. Add --apply only to save.');
 const revision=await db.from('ops_courier_master_revision').select('revision').eq('singleton',true).single();if(revision.error)throw new Error(revision.error.message);
 const records=await all('ops_courier_master'),aliases=await all('ops_courier_id_aliases'),byId=new Map(records.map(r=>[r.tgrid,r]));
 const w=X.readFile(file);if(!w.Sheets.KURIR)throw new Error('Missing KURIR sheet.');
 let preservedNames=0;
 const input=X.utils.sheet_to_json(w.Sheets.KURIR,{range:1,defval:''}).map((raw,i)=>{
   const row=core.normalizeCourier(raw,'KURIR:'+(i+3));
   if(core.missingMasterFields(row).length)throw new Error('Incomplete operational source at '+row.row);
   const current=byId.get(row.tgrid);if(current){if(core.personName(row.name)!==core.personName(current.name))preservedNames++;row.name=current.name;}
   return row;
 });
 const plan=core.planImport(input,records,aliases);
 console.log(JSON.stringify({counts:plan.counts,existingNamesPreserved:preservedNames}));
 if(plan.counts.blocked)throw new Error('Source has unresolved conflicts; no data saved.');
 if(!process.argv.includes('--apply')){console.log('Read-only preview. No data saved.');return;}
 const actor=(process.env.INTERNAL_SUPER_ADMIN_EMAIL||'ibadnarpatih@gmail.com').trim().toLowerCase();
 const r=await db.rpc('ops_sync_courier_master',{p_revision:revision.data.revision,p_operations:plan.operations,p_month:'2026-10-01',p_actor:actor});
 if(r.error)throw new Error(r.error.message);console.log('Saved',JSON.stringify(r.data));
 const after=await all('ops_courier_master');console.log(JSON.stringify({total:after.length,complete:after.filter(x=>!core.missingMasterFields(x).length).length,incomplete:after.filter(x=>core.missingMasterFields(x).length).map(x=>x.tgrid)}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
