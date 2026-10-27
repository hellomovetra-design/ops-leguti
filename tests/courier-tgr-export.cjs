const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||require(n),TextEncoder,TextDecoder,Uint8Array,Date,URL});return m.exports;}
const definitions=load('lib/courier-checks.ts');
const {courierReportXlsx}=load('lib/courier-report-export.ts',{'./courier-checks':definitions});
const template=fs.readFileSync('public/templates/pemeriksaan-connote.xlsx');
const item={id:'report',courier_id:'PRIVATE-NIK-001',courier_tgrid:'TGR159',courier_name:'Kurir',inspection_date:'2026-10-27',inspection_time:'08:30',delivery_area:'SPC LEGUTI',runsheet_count:1,physical_count:1,photos:[]};
const XLSX=require('xlsx');
const book=XLSX.read(courierReportXlsx(template,[item],'https://ops.test'),{type:'array'});
assert.equal(book.Sheets[book.SheetNames[0]].E2.v,'TGR159');
const empty=XLSX.read(courierReportXlsx(template,[{...item,courier_tgrid:''}],'https://ops.test'),{type:'array'});
assert.equal(empty.Sheets[empty.SheetNames[0]].E2?.v||'','');
assert.equal(definitions.checkCell(item,'courier_id'),'TGR159');
console.log('PASS: ID Kurir export and print use TGR, missing TGR never falls back to NIK.');
