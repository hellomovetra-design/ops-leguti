import { employeeStatus, EMPLOYEE_STATUS_LABELS } from './employee-status';
import { employeeEmployment, EMPLOYMENT_LABELS } from './employee-employment';
export const PERSONNEL_FIELDS:Record<string,string>={nik:'NIK',tgrid:'TGR ID',name:'Nama',position:'Jabatan',dept:'Departemen',hub:'Hub / area',level:'Level',superior:'Atasan',superior_nik:'NIK atasan',phone:'Telepon / WA',email:'Email',start_date:'Tanggal masuk'};
export type PersonnelChange={id:string;employee_nik:string;employee_name:string;action:string;actor_email:string|null;before_data:Record<string,any>|null;after_data:Record<string,any>|null;created_at:string};
export const ACTION_LABELS:Record<string,string>={create:'Karyawan baru',update:'Perubahan data',delete:'Data dihapus'};
export function personnelDiff(row:PersonnelChange){
 const before=row.before_data,after=row.after_data,result:{field:string;before:string;after:string}[]=[];
 const add=(field:string,a:unknown,b:unknown)=>{if(String(a??'')!==String(b??''))result.push({field,before:String(a??''),after:String(b??'')});};
 for(const [key,label] of Object.entries(PERSONNEL_FIELDS))add(label,before?.[key],after?.[key]);
 add('Status karyawan',before?EMPLOYEE_STATUS_LABELS[employeeStatus(before)]:null,after?EMPLOYEE_STATUS_LABELS[employeeStatus(after)]:null);
 add('Kepegawaian',before?EMPLOYMENT_LABELS[employeeEmployment(before)]:null,after?EMPLOYMENT_LABELS[employeeEmployment(after)]:null);
 return result;
}
export function personnelFilters(params:URLSearchParams){
 const action=params.get('action')||'',from=params.get('from')||'',to=params.get('to')||'',query=(params.get('q')||'').trim();
 if(action&&!['create','update','delete'].includes(action))throw new Error('Jenis perubahan tidak valid.');
 const valid=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v;
 if((from&&!valid(from))||(to&&!valid(to))||(from&&to&&from>to))throw new Error('Rentang tanggal tidak valid.');
 return {action,from,to,query};
}
export function applyPersonnelFilters(db:any,filters:ReturnType<typeof personnelFilters>){
 if(filters.action)db=db.eq('action',filters.action);
 if(filters.from)db=db.gte('created_at',`${filters.from}T00:00:00+07:00`);
 if(filters.to){const next=new Date(`${filters.to}T00:00:00+07:00`);next.setUTCDate(next.getUTCDate()+1);db=db.lt('created_at',next.toISOString());}
 // Escape PostgREST logical separators and LIKE wildcards in user search.
 const query=filters.query.replace(/[^\p{L}\p{N}@. -]/gu,' ').trim();
 if(query)db=db.or(`employee_name.ilike.%${query}%,employee_nik.ilike.%${query}%,actor_email.ilike.%${query}%`);
 return db;
}
