// Account email identifies the owner; employee names are resolved only through the NIK link.
export async function damageSenders(db:any,rows:any[]){
 const names=new Map<string,{name:string;nik:string}>(),emails=[...new Set<string>(rows.map(row=>String(row.created_by||'').toLowerCase()).filter(Boolean))];
 for(let start=0;start<emails.length;start+=500){
  const links=await db.from('ops_user_employee_links').select('email,employee_nik').in('email',emails.slice(start,start+500));
  if(links.error)throw Error('Nama pengirim belum dapat dimuat.');
  const niks=[...new Set((links.data||[]).map((link:any)=>link.employee_nik).filter(Boolean))];
  if(!niks.length)continue;
  const people=await db.from('ops_employees').select('nik,name').in('nik',niks);
  if(people.error)throw Error('Nama karyawan belum dapat dimuat.');
  const byNik=new Map<string,string>((people.data||[]).map((person:any)=>[person.nik,person.name]));
  for(const link of links.data||[]){const name=byNik.get(link.employee_nik);if(name)names.set(link.email.toLowerCase(),{name,nik:link.employee_nik});}
 }
 return rows.map(row=>({...row,sender_name:names.get(String(row.created_by||'').toLowerCase())?.name||'Akun belum terhubung ke karyawan',sender_nik:names.get(String(row.created_by||'').toLowerCase())?.nik||null}));
}
