const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),XLSX=require('xlsx');
const moduleObject={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/employee-bulk.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:moduleObject,exports:moduleObject.exports,Date});
const {employeeStartDate,employeeBulkExcelRows,employeeBulkRows}=moduleObject.exports;
assert.equal(employeeStartDate('28/10/2026'),'2026-10-28');assert.equal(employeeStartDate('2026-10-28'),'2026-10-28');assert.equal(employeeStartDate('29-2-2024'),'2024-02-29');assert.equal(employeeStartDate(''),'');
for(const value of ['31/02/2026','29/02/2025','2026-13-01','10/11/26',60,NaN,Infinity])assert.throws(()=>employeeStartDate(value));
assert.equal(employeeStartDate(1),'1900-01-01');assert.equal(employeeStartDate(0,true),'1904-01-01');
const date='2020-07-15',serial=(Date.parse(date+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000;
for(const date1904 of [false,true]){
 const book=XLSX.utils.book_new();book.Workbook={WBProps:{date1904}};
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['NIK','FULL NAME','POSITION','TGL MASUK'],['N1','Nama','Kurir Motor',serial-(date1904?1462:0)]]),'LEGUTI MALOKO');
 const restored=XLSX.read(XLSX.write(book,{bookType:'xlsx',type:'buffer'}),{type:'buffer'});
 const rows=employeeBulkExcelRows(XLSX.utils.sheet_to_json(restored.Sheets['LEGUTI MALOKO'],{defval:''}),!!restored.Workbook?.WBProps?.date1904);
 assert.equal(rows[0].start_date,date);assert.equal(employeeBulkRows(rows)[0].start_date,date);
}
assert.equal(employeeBulkExcelRows([{'NIK':'N1','FULL NAME':'Nama',' Tanggal Masuk ':'15/7/2020'}])[0].start_date,date);
assert.throws(()=>employeeBulkExcelRows([{NIK:'N1','FULL NAME':'Nama','TGL MASUK':'31/2/2026'}]),/Baris 2/);
const blank=employeeBulkRows([{nik:'N1',name:'Nama',start_date:'',employment:'Nonaktif',active:false}])[0];assert(!Object.hasOwn(blank,'start_date'));assert(!Object.hasOwn(blank,'active'));assert(!Object.hasOwn(blank,'employment'));
const ui=fs.readFileSync('components/employee-admin.tsx','utf8');assert(ui.includes('setBulkRows(employeeBulkExcelRows(raw,'));
const api=fs.readFileSync('app/api/ops-desk/route.ts','utf8');assert(api.includes('rpc("ops_merge_employee_batch_v2"'));
console.log('PASS: actual XLSX date import (1900/1904), Indonesian/ISO formats, invalid dates rejected, blank dates preserved, status excluded and versioned RPC.');
