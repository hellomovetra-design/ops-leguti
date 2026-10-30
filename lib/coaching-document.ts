import { AlignmentType, BorderStyle, Document, HeightRule, Packer, Paragraph, Table,TableCell,TableRow,TableLayoutType,TextRun,VerticalAlign,WidthType } from "docx";
import { COACHING_FIELDS, coachingDetails, CoachingDetails } from "./coaching-workflow";
export type CoachingRecord={id:string;kind:string;employee_name:string;employee_nik:string;position:string;hub:string;superior_name:string;recorder_name:string;incident_date:string;coaching_details:CoachingDetails|null;workflow_status?:string};
export function coachingDocumentData(record:CoachingRecord){
 if(record.kind!=="coaching")throw Error("Template PDF ST/SP/GA belum tersedia. Unggah template referensi terlebih dahulu.");
 const details=coachingDetails(record.coaching_details,record.kind)!;
 if(!record.recorder_name)throw Error("Nama pemberi coaching belum terhubung ke data karyawan. Lengkapi catatan sebelum mengunduh.");
 return details;
}
const displayDate=(date:string)=>date.split("-").reverse().join("/");
const TEMPLATE_LABELS={obstacles:"Kendala kinerja yang dialami oleh coachee :",targets:"Target kinerja yang ingin dicapai oleh coachee:",challenges:"Tantangan atau Kendala kinerja yang di alami oleh coachee dalam mencapai target :",action_plan:"Rencana Aksi Coachee dalam mencapai target kinerja :",summary:"Summary Coaching",agreement:"Agreement : (Diisi oleh coachee)",support:"Support yang dibutuhkan : (Optional)"};
type Cell={text:string;span:number;fill?:string;white?:boolean;bold?:boolean;italic?:boolean;center?:boolean;edge?:boolean;top?:boolean;bottom?:boolean;size?:number};
type Row={height:number;cells:Cell[];split?:boolean};
const colWidths=[1093,1260,1093,1093,1093,1093,1093,1093,1093],width=10004;
function templateRows(record:CoachingRecord):Row[]{
 const d=coachingDocumentData(record),rows:Row[]=[];
 const full=(text:string,height:number,opts:Partial<Cell>={})=>rows.push({height,cells:[{text,span:9,...opts}]});
 full("FORM SESI COACHING",30,{fill:"305496",white:true,bold:true,center:true,size:19,top:true,bottom:true});
 full("",5.25);
 rows.push({height:24.95,cells:[{text:"Coach : Leader yang memberikan coaching",span:3,fill:"FFFF00",italic:true},{text:"",span:1},{text:"Coachee: Karyawan yang diberikan coaching",span:4,fill:"FFFF00",italic:true,center:true},{text:"",span:1}]});
 full("",5.25,{bottom:true});
 for(const [label,value] of [["Nama peserta diskusi / Coachee",record.employee_name],["Tanggal / Waktu  / Durasi",`${displayDate(record.incident_date)} / ${d.session_time} / ${d.duration_minutes} menit`],["Nama Leader / Coach",record.recorder_name]])rows.push({height:24.95,cells:[{text:label,span:2},{text:': '+value,span:7}]});
 full("",15);
 const lines=(value:string,count:number)=>{const all=value.split(/\r?\n/).map(v=>v.replace(/^\s*\d+[.)]\s*/,""));return Array.from({length:count},(_,i)=>i===count-1?all.slice(i).join("\n"):all[i]||"");};
 for(const key of ["obstacles","targets","challenges"] as const){full(TEMPLATE_LABELS[key],24.95,{top:true,italic:true});for(const [i,value]of lines(d[key],3).entries())full(`${i+1}. ${value}`,30);}
 full(TEMPLATE_LABELS.action_plan,24.95,{top:true,italic:true});
 const actions=lines(d.action_plan,6);for(let i=0;i<3;i++)rows.push({height:39.95,cells:[{text:`${i+1}. ${actions[i]}`,span:4},{text:`${i+4}. ${actions[i+3]}`,span:5}]});
 full(TEMPLATE_LABELS.summary,31.5,{center:true,top:true,bottom:true});full(d.summary,119.85);
 rows.push({height:149.7,cells:[{text:TEMPLATE_LABELS.agreement+"\n"+d.agreement,span:4,edge:true,top:true,bottom:true},{text:"",span:1},{text:TEMPLATE_LABELS.support+"\n"+d.support,span:4,edge:true,top:true,bottom:true}]});
 rows.push({height:15,cells:[{text:"",span:4,edge:true},{text:"",span:1},{text:"",span:4,edge:true}]});
 rows.push({height:15,cells:[{text:"Karyawan/ Coachee",span:4,center:true,edge:true,italic:true},{text:"",span:1},{text:"Leader/ Coach",span:4,center:true,edge:true,italic:true}]});
 rows.push({height:60,cells:[{text:"",span:4,edge:true},{text:"",span:1},{text:"",span:4,edge:true}]});
 rows.push({height:15,cells:[{text:record.employee_name,span:4,center:true,edge:true},{text:"",span:1},{text:record.recorder_name,span:4,center:true,edge:true}]});
 rows.push({height:15,cells:[{text:"_________________________________",span:4,center:true,edge:true},{text:"",span:1},{text:"_________________________________",span:4,center:true,edge:true}]});
 rows.push({height:15,cells:[{text:"Tanggal:",span:4,edge:true},{text:"",span:1},{text:"Tanggal:",span:4,edge:true}]});
 rows.push({height:15.75,cells:[{text:"",span:4,edge:true,bottom:true},{text:"",span:1},{text:"",span:4,edge:true,bottom:true}]});
 return rows;
}
export async function coachingDocx(record:CoachingRecord,_logo?:Uint8Array){
 const thin={style:BorderStyle.SINGLE,size:5,color:"000000"},outer={style:BorderStyle.SINGLE,size:10,color:"000000"},none={style:BorderStyle.NONE,size:0,color:"FFFFFF"};
 const table=new Table({width:{size:width,type:WidthType.DXA},columnWidths:colWidths,layout:TableLayoutType.FIXED,borders:{top:none,bottom:none,left:none,right:none,insideHorizontal:none,insideVertical:none},rows:templateRows(record).map(row=>{
 let start=0;
 return new TableRow({height:{value:Math.round(row.height*0.63*20),rule:HeightRule.ATLEAST},children:row.cells.map((c,index)=>{
 const w=colWidths.slice(start,start+c.span).reduce((a,b)=>a+b,0);start+=c.span;
 return new TableCell({columnSpan:c.span,width:{size:w,type:WidthType.DXA},verticalAlign:c.center||/^\d+[.]/.test(c.text)?VerticalAlign.CENTER:VerticalAlign.TOP,margins:{top:0,bottom:0,left:25,right:25},shading:c.fill?{fill:c.fill}:undefined,borders:{left:c.edge||index===0?outer:none,right:c.edge||index===row.cells.length-1?outer:none,top:c.top?thin:none,bottom:c.bottom?thin:none},children:c.text.split(/\r?\n/).map((line,i)=>new Paragraph({alignment:c.center?AlignmentType.CENTER:AlignmentType.LEFT,spacing:{before:0,after:0,line:175},children:[new TextRun({text:line||" ",bold:c.bold,italics:c.italic,color:c.white?"FFFFFF":"000000",size:c.size||15})]}))});})});})});
 const doc=new Document({creator:"Movetra",title:"FORM SESI COACHING",styles:{default:{document:{run:{font:"Calibri",size:15,color:"000000"},paragraph:{spacing:{before:0,after:0,line:175}}}}},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:850,bottom:700,left:951,right:951}}},children:[table]}]});
 return Packer.toBuffer(doc);
}
export function coachingPrintHtml(record:CoachingRecord){
 const escape=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
 return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>FORM SESI COACHING</title><style>@page{size:A4;margin:15mm}body{margin:0;font:7.5pt Calibri,Arial,sans-serif;color:#000}table{width:100%;table-layout:fixed;border-collapse:collapse}td{vertical-align:top;padding:0 1pt;white-space:pre-wrap;overflow-wrap:anywhere}tr{break-inside:auto}p{margin:0}</style></head><body><table><colgroup>${colWidths.map(w=>`<col style="width:${w/width*100}%">`).join("")}</colgroup>${templateRows(record).map(row=>`<tr style="height:${row.height*0.63}pt">${row.cells.map((c,i)=>`<td colspan="${c.span}" style="border-left:${c.edge||i===0?"1pt solid black":"none"};border-right:${c.edge||i===row.cells.length-1?"1pt solid black":"none"};border-top:${c.top?".5pt solid black":"none"};border-bottom:${c.bottom?".5pt solid black":"none"};background:${c.fill?'#'+c.fill:'white'};color:${c.white?'white':'black'};text-align:${c.center?'center':'left'};font-style:${c.italic?'italic':'normal'};font-weight:${c.bold?'bold':'normal'};font-size:${(c.size||15)/2}pt">${escape(c.text)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
}
