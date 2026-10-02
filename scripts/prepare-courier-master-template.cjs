// Mechanical sanitisation of the provided layout. No source personnel are retained.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,overrides={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:name=>overrides[name]??require(name),TextDecoder,TextEncoder,Uint8Array,console});return m.exports;}
const core=load('lib/courier-master.ts'),report=load('lib/courier-master-export.ts',{'./courier-master':core});
const source=process.argv[2];if(!source)throw new Error('Provide the original .xlsx path.');
const bytes=report.masterCourierXlsx(fs.readFileSync(source),[],'2026-10');
fs.mkdirSync('assets/templates',{recursive:true});fs.writeFileSync('assets/templates/courier-master.xlsx',bytes);
console.log('Prepared sanitised blank layout template.');
