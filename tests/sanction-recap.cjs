const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||require(n),Date,URLSearchParams,Set,fetch});return m.exports}
const workflow=load('lib/coaching-workflow.ts'),form=load('lib/sanction-form.ts');
const recap=load('lib/sanction-recap.ts',{'./employee-sanctions':{SANCTION_KINDS:{coaching:'Coaching'}},'./coaching-workflow':workflow,'./sanction-form':form});
(async()=>{
 const calls=[],row={id:'1',kind:'coaching',employee_nik:'00123',employee_name:'Nama',incident_date:'2026-10-30',workflow_status:'final',recorder_name:'Coach',description:'=SUM(A1)',coaching_details:{summary:'Hasil'}};
 const rows=await recap.fetchSanctionRecap('Nama','coaching',async url=>{calls.push(url);return Response.json(calls.length===1?{items:[row],has_more:true}:{items:[row,{...row,id:'2'}],has_more:false})});
 assert.equal(rows.length,2);assert(calls[1].includes('offset=50'));assert(calls.every(url=>url.includes('q=Nama')&&url.includes('kind=coaching')&&url.includes('scope=admin')));
 const values=recap.sanctionRecapRows(rows);assert.equal(values[0].length,recap.RECAP_HEADERS.length);assert.equal(values[0][3],'00123');assert.equal(values[0][8],'=SUM(A1)');assert.equal(values[0][11],'Selesai · dokumen bertanda tangan');
 await assert.rejects(()=>recap.fetchSanctionRecap('','',async()=>Response.json({error:'Ditolak'},{status:403})),/Ditolak/);
 let n=0;await assert.rejects(()=>recap.fetchSanctionRecap('','',async()=>++n===1?Response.json({items:[row],has_more:true}):Response.json({error:'Jaringan'},{status:503})),/Jaringan/);
 console.log('PASS: recap fetches all filtered pages, deduplicates, preserves NIK/text, maps complete columns and rejects partial/unauthorized downloads.');
})().catch(e=>{console.error(e);process.exitCode=1});
