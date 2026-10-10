const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),XLSX=require('xlsx');
function load(file,mocks={},env={SUPABASE_SERVICE_ROLE_KEY:'test-only'}){
 const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||require(n),process:{env},console,URL,Date,Map,Set});return m.exports;
}
const mocks={'./evidence-share':{validEvidenceToken:value=>/^[a-f0-9]{64}$/.test(value)}};
const {exportEvidenceLinks}=load('lib/evidence-export.ts',mocks),{evidenceReportWorkbook}=load('lib/evidence-report-workbook.ts');
const damage=load('lib/damage-case.ts'),barkur=load('lib/barkur.ts');
let shares=new Map(),reads=0,writes=0,failRead=false,failWrite=false,race=false;
const db={from(table){assert.equal(table,'ops_evidence_shares');let kind,ids;const q={select(){return q},eq(k,v){kind=v;return q},in(k,v){ids=v;assert(ids.length<=500);return q},then(resolve,reject){reads++;return Promise.resolve({data:ids.map(id=>shares.get(kind+':'+id)).filter(Boolean),error:failRead?{}:null}).then(resolve,reject)},async upsert(rows,options){assert(options.ignoreDuplicates);writes++;if(failWrite)return{error:{}};for(const row of rows){const key=row.kind+':'+row.record_id;if(race)shares.set(key,{...row,token:'b'.repeat(64)});else if(!shares.has(key))shares.set(key,row);}return{error:null}}};return q}};
(async()=>{
 const origin='https://ops.movetra.id';let result=await exportEvidenceLinks(db,'damage',['one','one'],'admin@test',origin);
 assert.equal(result.size,1);assert.match(result.get('one'),/^https:\/\/ops\.movetra\.id\/evidence\/[a-f0-9]{64}$/);
 const stable=result.get('one'),before=writes;assert.equal((await exportEvidenceLinks(db,'damage',['one'],'admin@test',origin)).get('one'),stable);assert.equal(writes,before);
 shares.get('damage:one').revoked_at='2026-10-10';assert.equal((await exportEvidenceLinks(db,'damage',['one'],'admin@test',origin)).size,0);assert.equal(writes,before);assert(shares.get('damage:one').revoked_at);
 race=true;assert.equal((await exportEvidenceLinks(db,'problem',['race'],'admin@test',origin)).get('race'),origin+'/evidence/'+'b'.repeat(64));race=false;
 const ids=Array.from({length:1001},(_,i)=>'bulk'+i);assert.equal((await exportEvidenceLinks(db,'barkur',ids,'admin@test',origin)).size,1001);
 failRead=true;await assert.rejects(()=>exportEvidenceLinks(db,'damage',['error'],'admin@test',origin));failRead=false;
 failWrite=true;await assert.rejects(()=>exportEvidenceLinks(db,'damage',['error'],'admin@test',origin));failWrite=false;
 const absent=load('lib/evidence-export.ts',mocks,{});assert.equal((await absent.exportEvidenceLinks(db,'damage',[],'admin@test',origin)).size,0);await assert.rejects(()=>absent.exportEvidenceLinks(db,'damage',['one'],'admin@test',origin));
 const link=origin+'/evidence/'+'c'.repeat(64),links=new Map([['case',link]]),row={id:'case',awb:'001234',trip:'MEGA HUB',fleet:'',plate:'B 1234 AA',remark:'=SUM(1)',status:'open',resolution:'',created_at:'2026-10-10T00:00:00Z',updated_at:'2026-10-10T00:00:00Z',created_by:'admin@test',photos:[],evidence:[],evidence_link:'https://drive.google.com/file/d/photo/view',incident_at:'2026-10-10T00:00:00Z',email_sent_at:null};
 const csv=damage.damageCsv([row],origin,links);assert(!csv.includes('/pwa/'));const book=XLSX.read(evidenceReportWorkbook(csv,'Damage Case'));
 assert.equal(book.Sheets['Damage Case'].C2.v,'001234');assert.equal(book.Sheets['Damage Case'].C2.t,'s');assert.equal(book.Sheets['Damage Case'].G2.f,undefined);assert.equal(book.Sheets['Damage Case'].K2.l.Target,link);
 const bcsv=barkur.barkurCsv([row],origin,links);assert(!bcsv.includes('/api/barkur'));const bbook=XLSX.read(evidenceReportWorkbook(bcsv,'BARKUR'));
 assert.equal(bbook.Sheets.BARKUR.L2.l.Target,link);assert.equal(bbook.Sheets.BARKUR.M2.l.Target,row.evidence_link);
 assert(!damage.damageCsv([row],origin).includes('/evidence/'));assert(!barkur.barkurCsv([row],origin).includes('/evidence/'));
 console.log('PASS: public report links, stable reuse, revocation, concurrent creation, 1001 records, fail-closed errors, real Excel hyperlinks, literal AWB/formula safety.');
})().catch(e=>{console.error(e);process.exitCode=1});
