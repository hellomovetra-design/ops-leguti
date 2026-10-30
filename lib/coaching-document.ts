import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, Packer, PageNumber, Paragraph, Table,TableCell,TableRow,TextRun,WidthType } from "docx";
import { COACHING_FIELDS, coachingDetails, CoachingDetails } from "./coaching-workflow";
export type CoachingRecord={id:string;kind:string;employee_name:string;employee_nik:string;position:string;hub:string;superior_name:string;recorder_name:string;incident_date:string;coaching_details:CoachingDetails|null;workflow_status?:string};
export function coachingDocumentData(record:CoachingRecord){
 if(record.kind!=="coaching")throw Error("Template PDF ST/SP/GA belum tersedia. Unggah template referensi terlebih dahulu.");
 const details=coachingDetails(record.coaching_details,record.kind)!;
 if(!record.recorder_name)throw Error("Nama pemberi coaching belum terhubung ke data karyawan. Lengkapi catatan sebelum mengunduh.");
 return details;
}
const displayDate=(date:string)=>date.split("-").reverse().join("/");
export async function coachingDocx(record:CoachingRecord,logo?:Uint8Array){
 const d=coachingDocumentData(record);
 const text=(value:string,bold=false)=>new Paragraph({spacing:{after:50},children:[new TextRun({text:value,bold})]});
 const border={style:BorderStyle.SINGLE,size:5,color:"A7B8CE"};
 const borders={top:border,bottom:border,left:border,right:border,insideHorizontal:border,insideVertical:border};
 const cell=(value:string,label=false)=>new TableCell({shading:label?{fill:"EDF2F8"}:undefined,margins:{top:75,bottom:75,left:110,right:110},children:value.split(/\r?\n/).map(line=>text(line,label))});
 const identity=new Table({width:{size:100,type:WidthType.PERCENTAGE},columnWidths:[2800,6800],borders,rows:[
 ["Nama Coachee",record.employee_name],["NIK",record.employee_nik],["Jabatan / Hub",`${record.position} / ${record.hub}`],["Tanggal / Waktu / Durasi",`${displayDate(record.incident_date)} / ${d.session_time} WIB / ${d.duration_minutes} menit`],["Nama Leader / Coach",record.recorder_name]
 ].map(([label,value])=>new TableRow({cantSplit:true,children:[cell(label,true),cell(value)]}))});
 const children:(Paragraph|Table)[]=[
 ...(logo?[new Paragraph({children:[new ImageRun({type:"jpg",data:logo,transformation:{width:110,height:44}})],spacing:{after:80}})]:[]),
 new Paragraph({text:"FORM SESI COACHING",heading:HeadingLevel.TITLE,alignment:AlignmentType.CENTER,spacing:{after:120}}),
 new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:140},children:[new TextRun({text:"PEMBINAAN DAN PENGEMBANGAN KARYAWAN",size:17,color:"153B68"})]}),identity,new Paragraph({spacing:{after:40}})
 ];
 children.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},columnWidths:[9600],borders,rows:Object.entries(COACHING_FIELDS).flatMap(([key,label],index)=>[
 new TableRow({cantSplit:true,children:[new TableCell({shading:{fill:"153B68"},margins:{top:65,bottom:65,left:110,right:110},children:[new Paragraph({keepNext:true,spacing:{after:0},children:[new TextRun({text:`${index+1}. ${label}`,bold:true,color:"FFFFFF",size:19})]})]})]}),
 new TableRow({children:[cell(d[key as keyof typeof COACHING_FIELDS]||"________________________________________________________________")]})
 ])}));
 children.push(new Paragraph({text:"Tanda tangan",heading:HeadingLevel.HEADING_2,spacing:{before:140,after:80},keepNext:true}));
 const roles=[["Leader / Koordinator / Coach",record.recorder_name],["Karyawan / Coachee",record.employee_name]];
 children.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},columnWidths:[4800,4800],borders,rows:[
 new TableRow({cantSplit:true,children:roles.map(([role])=>new TableCell({shading:{fill:"EDF2F8"},children:[new Paragraph({text:role,alignment:AlignmentType.CENTER,spacing:{after:70,before:70}})]}))}),
 new TableRow({cantSplit:true,children:roles.map(([,name])=>new TableCell({margins:{top:80,bottom:80,left:100,right:100},children:[new Paragraph({text:" ",spacing:{after:550}}),new Paragraph({text:name||"________________________",alignment:AlignmentType.CENTER,spacing:{after:60}}),new Paragraph({text:"Tanggal: ________________",alignment:AlignmentType.CENTER})]}))})]}));
 const doc=new Document({creator:"Movetra",title:"Form Sesi Coaching",description:"Form sesi coaching untuk ditandatangani Leader/Koordinator dan karyawan",styles:{default:{document:{run:{font:"Arial",size:19,color:"000000"},paragraph:{spacing:{line:220}}},title:{run:{font:"Arial",size:28,bold:true,color:"000000"}},heading2:{run:{font:"Arial",size:20,bold:true,color:"000000"}}}},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:650,right:850,bottom:650,left:850}}},footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[new TextRun({text:`movetra.id   |   ${record.id.slice(0,8)}   |   `,size:16,color:"555555"}),new TextRun({children:[PageNumber.CURRENT],size:16})]})]})},children}]});
 return Packer.toBuffer(doc);
}
export function coachingPrintHtml(record:CoachingRecord){
 const d=coachingDocumentData(record),escape=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
 const field=(label:string,value:string)=>`<p><strong>${escape(label)}:</strong> ${escape(value)}</p>`;
 return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Form Sesi Coaching</title><style>@page{size:A4;margin:20mm}body{font:11pt Arial,sans-serif;color:#000;max-width:170mm;margin:30px auto;line-height:1.5}h1{text-align:center;font-size:16pt}h2{font-size:11pt;break-after:avoid;margin:18px 0 6px}p{margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere}.sign{break-inside:avoid;margin-top:20px}.space{height:60px}footer{margin-top:30px;font-size:9pt;color:#555}.hint{background:#eef3f8;padding:12px}@media print{.hint{display:none}body{margin:0;max-width:none}}</style></head><body><p class="hint">Gunakan menu Cetak browser atau Ctrl+P. Isi tanda tangan pada dokumen cetak.</p><h1>FORM SESI COACHING</h1>${field("Nama peserta diskusi / Coachee",record.employee_name)}${field("NIK",record.employee_nik)}${field("Jabatan / Hub",record.position+" / "+record.hub)}${field("Tanggal / Waktu / Durasi",displayDate(record.incident_date)+" / "+d.session_time+" WIB / "+d.duration_minutes+" menit")}${field("Nama Leader / Coach",record.recorder_name)}${Object.entries(COACHING_FIELDS).map(([key,label])=>`<h2>${escape(label)}</h2><p>${escape(d[key as keyof typeof COACHING_FIELDS]||"________________________________________________________________")}</p>`).join("")}${[["Leader / Koordinator / Coach",record.recorder_name],["Karyawan / Coachee",record.employee_name]].map(([role,name])=>`<section class="sign"><strong>${escape(role)}</strong><div class="space"></div><p>${escape(name||"________________________________")}</p><p>Tanggal: ________________________</p></section>`).join("")}<footer>movetra.id · ${escape(record.id)}</footer></body></html>`;
}
