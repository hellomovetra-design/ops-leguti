const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||require(n)});return m.exports;}
const employment=load('lib/employee-employment.ts'),status=load('lib/employee-status.ts');
const {filterEmployees}=load('lib/employee-dashboard-filters.ts',{'./employee-employment':employment,'./employee-status':status});
const rows=[
 {nik:'1',name:'A',position:'Kurir Motor',hub:'SP MALOKO',employment:'FREELANCE',active:true},
 {nik:'2',name:'B',position:'Kurir Motor',hub:'SP MALOKO',employment:'PKWTT',active:true},
 {nik:'3',name:'C',position:'Kurir Mobil',hub:'SP MALOKO',employment:'PKWT',active:true},
 {nik:'4',name:'D',position:'Kurir Motor',hub:'SPC LEGUTI',employment:'FREELANCE',active:true},
 {nik:'5',name:'E',position:'Leader',hub:'SP MALOKO',employment:'PKWTT',active:true},
 {nik:'6',name:'F',position:'Kurir Motor',hub:'SP MALOKO',employment:'FREELANCE',active:false},
];
const filters={status:'active',employment:'all',segment:'motor',hub:null,query:''};
assert.equal(filterEmployees(rows,filters).length,3);
assert.equal(filterEmployees(rows,filters,'employment').filter(x=>employment.employeeEmployment(x)==='outsource').length,2);
filters.hub='SP MALOKO';assert.equal(filterEmployees(rows,filters).length,2);
filters.employment='outsource';assert.equal(filterEmployees(rows,filters).length,1);
assert.equal(filterEmployees(rows,filters,'status').length,2);
assert.equal(filterEmployees(rows,filters,'hub').length,2);
assert.equal(filterEmployees(rows,filters,'employment').length,2);
filters.status='inactive';assert.equal(filterEmployees(rows,filters)[0].nik,'6');
filters.status='active';filters.query='not found';assert.equal(filterEmployees(rows,filters).length,0);
filters.query='A';assert.equal(filterEmployees(rows,filters).length,1);
assert.equal(status.employeeSummary(rows).formation,304);
console.log('PASS: linked job/hub/employment/status/search filters, contextual facet counts, inactive selection and fixed formation.');
