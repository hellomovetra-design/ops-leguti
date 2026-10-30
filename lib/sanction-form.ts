export const VIOLATION_TYPES={attendance:"Presensi",negligence:"Kelalaian",customer_service:"Pelayanan Pelanggan",behavior:"Perilaku",performance:"Kinerja",other:"Lain-lain",refuse_orders:"Menolak Perintah Atasan",company_rules:"Pelanggaran Peraturan Perusahaan"} as const;
export const PROPOSED_SANCTIONS={st:"Surat Teguran",sp1:"Surat Peringatan I",sp2:"Surat Peringatan II",sp3:"Surat Peringatan III",hc_ga:"GA (Perjanjian Bersama)"} as const;
export const APPROVAL_GUIDE=[
 ["Staff/Leader","Jr. Spv","SPV","DM"],
 ["Coord","Jr. Spv","Spv & DM","MGT"],
 ["Jr. Spv/SPV","DM","MGT","Deputy DM / BM"],
];
export type SanctionDetails={violations:string[];other_violation:string;contract_date:string;location:string;approver_one:string;approver_two:string;hco_notes:string;department:string;employment_status:string};
export const emptySanction=():SanctionDetails=>({violations:[],other_violation:"",contract_date:"",location:"Tangerang",approver_one:"",approver_two:"",hco_notes:"",department:"",employment_status:""});
export function sanctionDetails(value:unknown,kind:string):SanctionDetails|null{
 if(kind==="coaching")return null;
 if(!Object.hasOwn(PROPOSED_SANCTIONS,kind))throw Error("Jenis sanksi tidak valid.");
 let source:unknown=value;if(typeof source==="string"){try{source=JSON.parse(source)}catch{throw Error("Form sanksi tidak valid.")}}
 if(!source||typeof source!=="object"||Array.isArray(source))throw Error("Lengkapi form pengajuan sanksi.");
 const row=source as Record<string,unknown>,result=emptySanction();
 if(!Array.isArray(row.violations)||!row.violations.length||row.violations.length>8||row.violations.some(v=>typeof v!=="string"||!Object.hasOwn(VIOLATION_TYPES,v)))throw Error("Pilih minimal satu jenis pelanggaran.");
 result.violations=[...new Set(row.violations)] as string[];
 for(const field of ["other_violation","contract_date","location","approver_one","approver_two","hco_notes","department","employment_status"] as const){
  if(row[field]!==undefined&&typeof row[field]!=="string")throw Error("Isian form sanksi tidak valid.");
  result[field]=String(row[field]??result[field]).trim();
  if(result[field].length>(field==="hco_notes"?4000:250))throw Error("Isian form sanksi terlalu panjang.");
 }
 if(result.violations.includes("other")&&!result.other_violation)throw Error("Isi keterangan pelanggaran lain-lain.");
 if(!result.location)throw Error("Isi lokasi pengajuan.");
 if(result.contract_date){const d=new Date(result.contract_date+"T00:00:00Z");if(!/^\d{4}-\d{2}-\d{2}$/.test(result.contract_date)||Number.isNaN(+d)||d.toISOString().slice(0,10)!==result.contract_date)throw Error("Tanggal kontrak/tetap tidak valid.");}
 return result;
}
