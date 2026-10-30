import { EmployeeSanction, SANCTION_KINDS } from "./employee-sanctions";
import { COACHING_FIELDS, SANCTION_STAGES } from "./coaching-workflow";
import { VIOLATION_TYPES } from "./sanction-form";
export const RECAP_HEADERS = ["No", "Tanggal", "Nama", "NIK", "Jabatan", "Atasan", "Hub", "Jenis catatan", "Keterangan / alasan", "Hasil coaching", "Pemberi coaching / sanksi", "Status penyelesaian", "Tanggal selesai", "Jumlah foto", "Waktu sesi (WIB)", "Durasi (menit)", ...Object.values(COACHING_FIELDS), "Jenis pelanggaran", "Keterangan pelanggaran lain", "Departemen", "Status kepegawaian", "Tanggal kontrak / tetap", "Lokasi", "Atasan terkait 1", "Atasan terkait 2", "Catatan HCO"];
export function sanctionRecapRows(items: EmployeeSanction[]) {
  return items.map((r, i) => { const c=r.coaching_details, s=r.sanction_details;return [i+1,r.incident_date,r.employee_name,r.employee_nik,r.position,r.superior_name,r.hub,SANCTION_KINDS[r.kind],r.description,r.coaching_result,r.recorder_name||"",SANCTION_STAGES[r.workflow_status||"awaiting_signatures"],r.finalized_at?new Date(r.finalized_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"}):"",r.photos?.length||0,c?.session_time||"",c?.duration_minutes||"",...Object.keys(COACHING_FIELDS).map(key=>c?.[key as keyof typeof COACHING_FIELDS]||""),s?.violations.map(key=>VIOLATION_TYPES[key as keyof typeof VIOLATION_TYPES]).join(", ")||"",s?.other_violation||"",s?.department||"",s?.employment_status||"",s?.contract_date||"",s?.location||"",s?.approver_one||"",s?.approver_two||"",s?.hco_notes||""];});
}
export async function fetchSanctionRecap(q:string,kind:string,request:typeof fetch=fetch){
  const items:EmployeeSanction[]=[],seen=new Set<string>();
  for(let offset=0;;offset+=50){
    if(offset>100000)throw Error("Data terlalu banyak. Persempit filter sebelum mengunduh.");
    const response=await request(`/api/employee-sanctions?${new URLSearchParams({scope:"admin",q,kind,offset:String(offset)})}`,{cache:"no-store"});
    const data=await response.json();if(!response.ok)throw Error(data.error||"Rekap belum dapat diunduh.");
    for(const item of data.items||[])if(!seen.has(item.id)){seen.add(item.id);items.push(item);}
    if(!data.has_more)break;
    if(!data.items?.length)throw Error("Rekap berubah saat diunduh. Silakan coba kembali.");
  }
  return items;
}
