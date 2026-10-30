export const COACHING_FIELDS = {
  obstacles:"Kendala kinerja yang dialami oleh coachee",
  targets:"Target kinerja yang ingin dicapai oleh coachee",
  challenges:"Tantangan atau kendala dalam mencapai target",
  action_plan:"Rencana aksi coachee dalam mencapai target kinerja",
  summary:"Summary Coaching",
  agreement:"Agreement (diisi oleh coachee)",
  support:"Support yang dibutuhkan (opsional)",
} as const;
export type CoachingDetails = {session_time:string;duration_minutes:string} & Record<keyof typeof COACHING_FIELDS,string>;
export const emptyCoaching = ():CoachingDetails => ({session_time:"",duration_minutes:"",obstacles:"",targets:"",challenges:"",action_plan:"",summary:"",agreement:"",support:""});
export const SANCTION_STAGES = {awaiting_signatures:"Menunggu tanda tangan",sent_hrd:"Dikirim ke HRD",final:"Final ditandatangani HRD"} as const;
export type SanctionStage=keyof typeof SANCTION_STAGES;
export function coachingDetails(value:unknown,kind:string):CoachingDetails|null {
  if(kind!=="coaching")return null;
  let source:unknown=value;
  if(typeof source==="string") {try{source=JSON.parse(source)}catch{throw Error("Form coaching tidak valid.")}}
  if(!source||typeof source!=="object"||Array.isArray(source))throw Error("Lengkapi form sesi coaching.");
  const row=source as Record<string,unknown>,result=emptyCoaching();
  for(const key of Object.keys(result) as (keyof CoachingDetails)[]) {
    if(row[key]!==undefined&&typeof row[key]!=="string")throw Error("Isian coaching tidak valid.");
    result[key]=String(row[key]??"").trim();
    if(result[key].length>4000)throw Error("Setiap isian coaching maksimal 4.000 karakter.");
  }
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(result.session_time)||!/^\d{1,3}$/.test(result.duration_minutes)||Number(result.duration_minutes)<1||Number(result.duration_minutes)>480)throw Error("Isi waktu dan durasi sesi 1–480 menit.");
  for(const key of ["obstacles","targets","challenges","action_plan","summary"] as const)if(!result[key])throw Error(`Isi ${COACHING_FIELDS[key]}.`);
  return result;
}

export function workflowTransition(record:{workflow_status?:string;updated_at:string;kind?:string},body:Record<string,unknown>) {
  if(String(body.updated_at||"")!==record.updated_at)throw Error("Catatan berubah. Muat ulang sebelum melanjutkan.");
  const current=record.workflow_status||"awaiting_signatures";
  if(current==="final")throw Error("Dokumen final sudah dikunci.");
  if(body.action==="send_hrd") {
    if(current!=="awaiting_signatures")throw Error("Catatan sudah dikirim ke HRD.");
    if(body.employee_signed!=="true"||body.coach_signed!=="true")throw Error("Konfirmasi tanda tangan karyawan dan Leader/Koordinator terlebih dahulu.");
    if(record.kind&&record.kind!=="coaching"&&(body.approver_one_signed!=="true"||body.approver_two_signed!=="true"))throw Error("Konfirmasi tanda tangan Atasan Terkait 1 dan 2 terlebih dahulu.");
    return "sent_hrd" as const;
  }
  if(body.action==="finalize") {
    if(current!=="sent_hrd")throw Error("Kirim dokumen yang ditandatangani karyawan dan atasan ke HRD terlebih dahulu.");
    if(body.hrd_signed!=="true")throw Error("Konfirmasi dokumen sudah ditandatangani HRD.");
    return "final" as const;
  }
  throw Error("Tindakan alur dokumen tidak valid.");
}

export type FinalDocument={name:string;path:string;fileId:string;content_type:string};
export async function validateFinalDocument(file:File) {
  if(!file.size||file.size>3*1024*1024)throw Error("Scan final wajib satu file PDF/JPG/PNG/WebP maksimal 3 MB.");
  const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
  if(file.type==="application/pdf"&&String.fromCharCode(...bytes.slice(0,5))==="%PDF-")return;
  if(file.type==="image/jpeg"&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return;
  if(file.type==="image/png"&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return;
  if(file.type==="image/webp"&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP")return;
  throw Error("Scan final harus berupa PDF atau foto JPG/PNG/WebP yang valid.");
}
