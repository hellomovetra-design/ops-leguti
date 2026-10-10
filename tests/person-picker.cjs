const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/person-picker.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports});
const person={nik:'001234',name:'Fery Suhendra',position:'Inbound Delivery Leader',hub:'SPC LEGUTI'};
for(const query of ['','fery','SUHENDRA','001234','leader','spc leguti','fery 001234','  FERY   leguti  '])assert(m.exports.personMatches(person,query),query);
for(const query of ['giga','001235','fery maloko'])assert(!m.exports.personMatches(person,query),query);
const ui=fs.readFileSync('components/person-picker.tsx','utf8'),transfer=fs.readFileSync('components/team-transfer.tsx','utf8');
for(const value of ['role="combobox"','role="listbox"','role="option"','onChange(person.nik)',"onChange('')",'ArrowDown','ArrowUp','Enter','Escape','Tidak ada personel'])assert(ui.includes(value),value);
assert(!transfer.includes('<select'));assert.equal((transfer.match(/<PersonPicker/g)||[]).length,2);assert(transfer.includes("employeeStatus(p)==='active'"));
console.log('PASS: searchable source/target pickers, name/NIK/role/hub search, multiword/case handling, keyboard controls and NIK-only selection.');
