// Read-only audit by default. Contact-only updates; never create employees by name.
const {spawnSync}=require("node:child_process"), crypto=require("node:crypto");
const {createClient}=require("@supabase/supabase-js");
const ts=require("typescript"),helpers={};
new Function("exports",ts.transpileModule(require("node:fs").readFileSync("lib/employee-contacts.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(helpers);
const file=process.argv[2];
if(!file)throw Error("Provide the contact workbook path.");
process.loadEnvFile(".env.local");
const python="C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
const result=spawnSync(python,["-c","import pandas as pd,sys; d=pd.read_excel(sys.argv[1],dtype=str).fillna(''); d.columns=[c.strip() for c in d.columns]; print(d.to_json(orient='records',date_format='iso'))",file],{encoding:"utf8"});
if(result.status!==0)throw Error(result.stderr);
const source=JSON.parse(result.stdout), apply=process.argv.includes("--apply");
const normalizeName=v=>String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"");
const id=v=>String(v||"").trim().replace(/^'+/,"").replace(/\.0$/,"").replace(/\s+/g,"");
async function main(){
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 const employees=[];for(let n=0;;n+=1000){const r=await db.from("ops_employees").select("*").order("nik").range(n,n+999);if(r.error)throw Error(r.error.message);employees.push(...r.data);if(r.data.length<1000)break;}
 const ids=new Map(employees.map(e=>[e.nik,e])), zeroIds=new Map();
 for(const e of employees){const k=id(e.nik).replace(/^0+/,"");const a=zeroIds.get(k)||[];a.push(e);zeroIds.set(k,a);}
 const grouped=new Map(),issues=[],warnings=[],unmatched=[];let zeroMatched=0;
 for(let i=0;i<source.length;i++){
  const s=source[i],raw=id(s.NIK); if(!raw){issues.push({row:i+2,reason:"Missing NIK"});continue;}
  let e=ids.get(raw);
  if(!e){const candidates=zeroIds.get(raw.replace(/^0+/,""))||[];if(candidates.length===1&&normalizeName(candidates[0].name)===normalizeName(s.Nama)){e=candidates[0];zeroMatched++;}}
  if(!e){unmatched.push({row:i+2,nik:raw,name:s.Nama});continue;}
  let phone="",email="";
  try {phone=helpers.contactPhone(s["No Telpon Aktif (WA)"]);}catch{warnings.push({row:i+2,nik:raw,field:"phone",reason:"Invalid phone left blank"});}
  try {email=helpers.contactEmail(s["Email Pribadi Aktif"]);}catch{warnings.push({row:i+2,nik:raw,field:"email",reason:"Invalid email left blank"});}
  const entry={nik:e.nik,phone:phone||null,email:email||null};
  const old=grouped.get(e.nik);
  if(old&&JSON.stringify(old)!==JSON.stringify(entry)){issues.push({row:i+2,nik:raw,reason:"Conflicting duplicate NIK"});continue;}
  grouped.set(e.nik,entry);
 }
 const summary={sourceRows:source.length,employees:employees.length,matched:grouped.size,zeroMatched,withoutSource:employees.length-grouped.size,unmatched,issues,warnings,contactColumnsPresent:employees.length>0&&Object.hasOwn(employees[0],"phone")&&Object.hasOwn(employees[0],"email")};
 if(process.argv.includes("--plan-json")) {console.log(JSON.stringify({summary,rows:[...grouped.values()],names:Object.fromEntries([...grouped.keys()].map(nik=>[nik,ids.get(nik).name]))}));return;}
 console.log(JSON.stringify(summary));
 if(!apply)return;
 if(issues.length)throw Error("Resolve invalid/conflicting source rows before applying.");
 if(!Object.hasOwn(employees[0],"phone")||!Object.hasOwn(employees[0],"email"))throw Error("Apply contact migration first.");
 let changed=0;
 for(const entry of grouped.values()){
  const original=ids.get(entry.nik);if((original.phone||null)===entry.phone&&(original.email||null)===entry.email)continue;
  let q=db.from("ops_employees").update({phone:entry.phone,email:entry.email}).eq("nik",entry.nik);
  q=original.phone===null?q.is("phone",null):q.eq("phone",original.phone);
  q=original.email===null?q.is("email",null):q.eq("email",original.email);
  const r=await q.select("nik");if(r.error||r.data?.length!==1)throw Error("Contact changed concurrently or save failed; rerun audit.");
  const check=await db.from("ops_employees").select("phone,email").eq("nik",entry.nik).single();
  if(check.error||check.data.phone!==entry.phone||check.data.email!==entry.email)throw Error("Saved contact verification failed.");
  changed++;
 }
 console.log(JSON.stringify({updated:changed,unchanged:grouped.size-changed,sourceSha256:crypto.createHash("sha256").update(require("node:fs").readFileSync(file)).digest("hex")}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
