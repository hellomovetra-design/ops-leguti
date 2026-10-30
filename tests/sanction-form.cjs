const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),JSZip=require('jszip');
function load(file,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||require(n),Date,Buffer});return m.exports}
const model=load('lib/sanction-form.ts'),workflow=load('lib/coaching-workflow.ts'),document=load('lib/sanction-document.ts',{'./sanction-form':model});
const input={violations:['negligence','performance'],location:'Tangerang',contract_date:'2020-07-15',approver_one:'Atasan Satu',approver_two:'Atasan Dua',hco_notes:'',department:'Operational Inbound',employment_status:'Tetap (PKWTT)'};
for(const kind of ['st','sp1','sp2','sp3','hc_ga'])assert.equal(model.sanctionDetails(input,kind).location,'Tangerang');
for(const bad of [null,{}, {...input,violations:[]},{...input,violations:['unknown']},{...input,violations:['other'],other_violation:''},{...input,contract_date:'2026-02-31'}])assert.throws(()=>model.sanctionDetails(bad,'sp1'));
assert.equal(model.sanctionDetails(null,'coaching'),null);assert.equal(model.sanctionDetails({...input,contract_date:''},'hc_ga').contract_date,'');
assert.throws(()=>workflow.workflowTransition({kind:'sp1',updated_at:'v',workflow_status:'awaiting_signatures'},{action:'send_hrd',updated_at:'v',employee_signed:'true',coach_signed:'true'}),/Atasan Terkait/);
(async()=>{
 const logo=fs.readFileSync('assets/templates/sanction-jne-logo.jpg');
 for(const kind of ['st','sp1','sp2','sp3','hc_ga']){
 const record={id:'11111111-1111-4111-8111-111111111111',kind,employee_name:'Nama <script>bad</script>',employee_nik:'00123',position:'Kurir Motor',recorder_name:'Coach',incident_date:'2026-10-30',description:'Alasan pengajuan',sanction_details:input};
 const zip=await JSZip.loadAsync(await document.sanctionDocx(record,logo)),xml=await zip.file('word/document.xml').async('string');
 for(const text of ['Formulir Permintaan Pemberian Sanksi','00123','Operational Inbound','Tanggal Kontrak/Tetap','Alasan pengajuan','Atasan Satu','Atasan Dua','CATATAN HCO','Panduan Alur Proses Pengajuan Sanksi','Deputy DM / BM'])assert(xml.includes(text),text);
 assert.equal((xml.match(/☒/g)||[]).length,3,'Exactly one proposed sanction and two violation categories checked');assert(!xml.includes('PHK'),'GA per user means agreement; never invent termination');assert(xml.includes('&lt;script&gt;'));assert(zip.file('word/media/')||Object.keys(zip.files).some(k=>k.startsWith('word/media/')),'Source logo embedded');
 const html=document.sanctionPrintHtml(record,logo);assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes('image/jpeg;base64,'));
 }
 console.log('PASS: ST/SP1/SP2/SP3/GA forms and native DOCX, source logo/checklists/approvals, required violation/reason fields, contract date, no invented PHK, print escaping.');
})().catch(e=>{console.error(e);process.exitCode=1});
