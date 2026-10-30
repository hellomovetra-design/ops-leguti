import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph, Table,TableCell,TableRow,TextRun,WidthType } from "docx";
import { COACHING_FIELDS, coachingDetails, CoachingDetails } from "./coaching-workflow";
export type CoachingRecord={id:string;kind:string;employee_name:string;employee_nik:string;position:string;hub:string;superior_name:string;recorder_name:string;incident_date:string;coaching_details:CoachingDetails|null;workflow_status?:string};
export function coachingDocumentData(record:CoachingRecord){
 if(record.kind!=="coaching")throw Error("Template PDF ST/SP/GA belum tersedia. Unggah template referensi terlebih dahulu.");
 const details=coachingDetails(record.coaching_details,record.kind)!;
 if(!record.recorder_name)throw Error("Nama pemberi coaching belum terhubung ke data karyawan. Lengkapi catatan sebelum mengunduh.");
 return details;
}
const displayDate=(date:string)=>date.split("-").reverse().join("/");
export async function coachingDocx(record:CoachingRecord){
 const d=coachingDocumentData(record);
 const text=(value:string,bold=false)=>new Paragraph({spacing:{after:50},children:[new TextRun({text:value,bold})]});
 const field=(label:string,value:string)=>text(`${label}: ${value}`);
 const children:(Paragraph|Table)[]=[
  new Paragraph({text:"FORM SESI COACHING",heading:HeadingLevel.TITLE,alignment:AlignmentType.CENTER,spacing:{after:220}}),
  text("Coach: Leader / Koordinator yang memberikan coaching. Coachee: karyawan yang diberikan coaching."),
  field("Nama peserta diskusi / Coachee",record.employee_name),field("NIK",record.employee_nik),
  field("Jabatan / Hub",`${record.position} / ${record.hub}`),field("Tanggal / Waktu / Durasi",`${displayDate(record.incident_date)} / ${d.session_time} WIB / ${d.duration_minutes} menit`),field("Nama Leader / Coach",record.recorder_name),
 ];
 for(const [key,label]of Object.entries(COACHING_FIELDS)){
  children.push(new Paragraph({text:label,heading:HeadingLevel.HEADING_2,spacing:{before:120,after:60},keepNext:true}));
  for(const line of (d[key as keyof typeof COACHING_FIELDS]||"________________________________________________________________").split(/\r?\n/))children.push(text(line));
 }
 children.push(new Paragraph({text:"Tanda tangan",heading:HeadingLevel.HEADING_2,spacing:{before:240,after:100},keepNext:true}));
 const border={style:BorderStyle.SINGLE,size:4,color:"D9D9D9"};
 children.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},columnWidths:[3212,3212,3212],borders:{top:border,bottom:border,left:border,right:border,insideHorizontal:border,insideVertical:border},rows:[new TableRow({cantSplit:true,children:[["Karyawan / Coachee",record.employee_name],["Leader / Koordinator / Coach",record.recorder_name],["Mengetahui HRD",""]].map(([role,name])=>new TableCell({width:{size:33.33,type:WidthType.PERCENTAGE},margins:{top:120,bottom:120,left:120,right:120},children:[new Paragraph({text:role,alignment:AlignmentType.CENTER,spacing:{after:650}}),new Paragraph({text:name||"________________________",alignment:AlignmentType.CENTER,spacing:{after:80}}),new Paragraph({text:"Tanggal: ________________",alignment:AlignmentType.CENTER})]}))})]}));
 const doc=new Document({creator:"Movetra",title:"Form Sesi Coaching",description:"Form sesi coaching untuk ditandatangani karyawan, atasan dan HRD",styles:{default:{document:{run:{font:"Arial",size:20,color:"000000"},paragraph:{spacing:{line:240}}},title:{run:{font:"Arial",size:28,bold:true,color:"000000"}},heading2:{run:{font:"Arial",size:20,bold:true,color:"000000"}}}},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:850,right:1134,bottom:850,left:1134}}},footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[new TextRun({text:`movetra.id   |   ${record.id.slice(0,8)}   |   `,size:16,color:"555555"}),new TextRun({children:[PageNumber.CURRENT],size:16})]})]})},children}]});
 return Packer.toBuffer(doc);
}
export function coachingPrintHtml(record:CoachingRecord){
 const d=coachingDocumentData(record),escape=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
 const field=(label:string,value:string)=>`<p><strong>${escape(label)}:</strong> ${escape(value)}</p>`;
 return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Form Sesi Coaching</title><style>@page{size:A4;margin:20mm}body{font:11pt Arial,sans-serif;color:#000;max-width:170mm;margin:30px auto;line-height:1.5}h1{text-align:center;font-size:16pt}h2{font-size:11pt;break-after:avoid;margin:18px 0 6px}p{margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere}.sign{break-inside:avoid;margin-top:20px}.space{height:60px}footer{margin-top:30px;font-size:9pt;color:#555}.hint{background:#eef3f8;padding:12px}@media print{.hint{display:none}body{margin:0;max-width:none}}</style></head><body><p class="hint">Gunakan menu Cetak browser atau Ctrl+P. Isi tanda tangan pada dokumen cetak.</p><h1>FORM SESI COACHING</h1>${field("Nama peserta diskusi / Coachee",record.employee_name)}${field("NIK",record.employee_nik)}${field("Jabatan / Hub",record.position+" / "+record.hub)}${field("Tanggal / Waktu / Durasi",displayDate(record.incident_date)+" / "+d.session_time+" WIB / "+d.duration_minutes+" menit")}${field("Nama Leader / Coach",record.recorder_name)}${Object.entries(COACHING_FIELDS).map(([key,label])=>`<h2>${escape(label)}</h2><p>${escape(d[key as keyof typeof COACHING_FIELDS]||"________________________________________________________________")}</p>`).join("")}${[["Karyawan / Coachee",record.employee_name],["Leader / Koordinator / Coach",record.recorder_name],["Mengetahui HRD",""]].map(([role,name])=>`<section class="sign"><strong>${escape(role)}</strong><div class="space"></div><p>${escape(name||"________________________________")}</p><p>Tanggal: ________________________</p></section>`).join("")}<footer>movetra.id · ${escape(record.id)}</footer></body></html>`;
}
