const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),JSZip=require('jszip');
function load(file,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||require(n),Date,Buffer,Uint8Array});return m.exports}
const workflow=load('lib/coaching-workflow.ts'),document=load('lib/coaching-document.ts',{'./coaching-workflow':workflow});
const record={id:'11111111-1111-4111-8111-111111111111',kind:'coaching',employee_name:'Nama <script>alert(1)</script>',employee_nik:'00123',position:'Kurir Motor',hub:'SPC LEGUTI',superior_name:'Leader',recorder_name:'Coach',incident_date:'2026-10-30',coaching_details:{session_time:'09:30',duration_minutes:'30',obstacles:'Kendala',targets:'Target',challenges:'Tantangan',action_plan:'Rencana',summary:'Summary',agreement:'',support:''}};
(async()=>{
 const html=document.coachingPrintHtml(record);assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes('00123'));assert(html.includes('30/10/2026'));for(const label of Object.values(workflow.COACHING_FIELDS))assert(html.includes(label));
 const zip=await JSZip.loadAsync(await document.coachingDocx(record));const xml=await zip.file('word/document.xml').async('string');
 for(const text of ['FORM SESI COACHING','00123','30/10/2026','Coach','Mengetahui HRD','Agreement','Support'])assert(xml.includes(text));assert(xml.includes('&lt;script&gt;'));assert(xml.includes('w:cantSplit'),'Signature row cannot split across pages');
 const footer=await zip.file('word/footer1.xml').async('string');assert(footer.includes('movetra.id'));assert(footer.includes('PAGE'));
 await assert.rejects(()=>document.coachingDocx({...record,kind:'sp1'}),/Template PDF/);assert.throws(()=>document.coachingPrintHtml({...record,recorder_name:''}),/belum terhubung/);await assert.rejects(()=>document.coachingDocx({...record,coaching_details:null}),/Lengkapi/);
 console.log('PASS: real DOCX contains template fields, leading-zero NIK, names and signature areas; print escapes HTML, footer/page number present, incomplete/missing sanction templates refused.');
})().catch(e=>{console.error(e);process.exitCode=1});
