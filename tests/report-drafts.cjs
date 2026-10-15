// Temporary test dependencies: see docs/report-workflow.md (not application dependencies).
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const base='../.tmp/report-workflow-validation/node_modules/';
const React=require(base+'react'),renderer=require(base+'react-test-renderer'),{indexedDB}=require(base+'fake-indexeddb');
global.IS_REACT_ACT_ENVIRONMENT=true;
let email='first@test',rejectStorage=false;
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/use-report-draft.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:n=>n==='react'?React:require(n),indexedDB:{open(...args){if(rejectStorage)throw Error('Storage denied');return indexedDB.open(...args);}},Date,fetch:async()=>({ok:true,json:async()=>({profile:{email}})}),console});
const {act}=renderer;
let model,root;
const empty=()=>({id:crypto.randomUUID(),form:{awb:''},files:[]});
function Probe(){const [value,setValue]=React.useState(empty),[enabled,setEnabled]=React.useState(true);const draft=m.exports.useReportDraft('damage',enabled,value,!!value.form.awb,saved=>setValue(saved));model={value,setValue,draft,setEnabled};return null;}
async function settle(){for(let i=0;i<4;i++)await act(async()=>{await new Promise(r=>setTimeout(r,15));});}
async function mount(){await act(()=>{root=renderer.create(React.createElement(Probe));});await settle();}
async function unmount(){await act(()=>root.unmount());}
(async()=>{
 await mount();assert.equal(model.draft.ready,true);
 const stable='10000000-0000-4000-8000-000000000001';
 await act(()=>model.setValue({id:stable,form:{awb:'JT123'},files:[new Blob(['photo-bytes'],{type:'image/jpeg'})]}));await settle();await unmount();
 await mount();assert.equal(model.value.id,stable);assert.equal(model.value.form.awb,'JT123');assert.equal(await model.value.files[0].text(),'photo-bytes');await unmount();
 email='second@test';await mount();assert.equal(model.value.form.awb,'','Different account cannot restore another account draft');await unmount();
 email='first@test';await mount();assert.equal(model.value.id,stable);
 await act(()=>model.setEnabled(false));await act(()=>model.setValue(empty()));await settle();assert.equal(model.draft.ready,true);
 await act(()=>model.setEnabled(true));await settle();assert.equal(model.value.id,stable,'Leaving and re-entering a form must not overwrite its saved draft before restoration');
 await act(async()=>{await model.draft.clear();model.setValue(empty());});await settle();await unmount();
 await mount();assert.equal(model.value.form.awb,'','Successful send clears draft without a stale queued write restoring it');
 await act(()=>model.setValue({id:crypto.randomUUID(),form:{awb:'NEW'},files:[]}));await settle();await unmount();
 await m.exports.clearReportDrafts();await mount();assert.equal(model.value.form.awb,'','Logout cleanup removes drafts');await unmount();
 rejectStorage=true;await mount();assert.equal(model.draft.ready,true);assert(model.draft.message.includes('tidak tersedia'));await unmount();
 console.log('PASS: real React hook + IndexedDB draft and photo recovery across remount, account isolation, stable ID, clear/save race, logout cleanup and blocked storage.');
})().catch(e=>{console.error(e);process.exit(1);});
