import * as XLSX from "xlsx";
import { MASTER_FIELDS, MASTER_HEADERS, MasterRow } from "./courier-master";
const xml=(v:unknown)=>String(v??"").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
// Preserve source styles, columns, print settings and sheet layout instead of recreating them.
// All source personnel and pivot caches are removed from the exported archive.
export function masterCourierXlsx(template: Uint8Array, rows: MasterRow[], month: string) {
  const cfb=(XLSX as any).CFB, archive=cfb.read(template,{type:"array"});
  const read=(p:string)=>new TextDecoder().decode(cfb.find(archive,"/"+p)?.content);
  const put=(p:string,s:string)=>cfb.utils.cfb_add(archive,"Root Entry/"+p,new TextEncoder().encode(s));
  const inline=(ref:string,value:unknown,style:string)=>`<c r="${ref}"${style?` s="${style}"`:""} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  const labels=["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  const title=`${labels[Number(month.slice(5,7))-1].toUpperCase()} ${month.slice(0,4)}`;
  for(let index=1;index<=4;index++){
    const p=`xl/worksheets/sheet${index}.xml`;let sheet=read(p);
    const offset=index>=3?1:0;
    const fields=index===3?["tgrid","name","orion"]:index===4?MASTER_FIELDS.slice(0,7):MASTER_FIELDS;
    const headers=index===3?["ID KURIR","NAMA KURIR","NAMA ORION"]:index===4?MASTER_HEADERS.slice(0,7):MASTER_HEADERS;
    const data=index===4?rows.filter(x=>x.tgrid.startsWith("TGRFL")):rows;
    const last=Math.max(3,data.length+2),end=String.fromCharCode(65+offset+fields.length-1);
    const rowStyle=sheet.match(/<row r="3"[^>]*>/)?.[0]?.replace(/ r="3"/,"")?.replace(/ spans="[^"]*"/,"")?.replace(/>$/,"")??"<row";
    const cellStyles=new Map<string,string>();
    for(const match of sheet.matchAll(/<c r="([A-Z]+)([123])"([^>]*)>/g))cellStyles.set(match[1]+match[2],match[3].match(/s="(\d+)"/)?.[1]??"");
    const makeRow=(r:number,values:unknown[])=>`${r===3?rowStyle:`<row`} r="${r}">${values.map((v,i)=>{const col=String.fromCharCode(65+offset+i),ref=col+r,style=cellStyles.get(col+Math.min(r,3))??"";return fields[i]==="kpi"&&r>2&&v!==""&&v!==null&&v!==undefined&&Number.isFinite(Number(v))?`<c r="${ref}"${style?` s="${style}"`:""} t="n"><v>${Number(v)}</v></c>`:inline(ref,v,style);}).join("")}</row>`;
    const contents=index===2?"":makeRow(1,[title])+makeRow(2,headers)+(data.length?data.map((item,i)=>makeRow(i+3,fields.map(f=>(item as any)[f]??""))).join(""):makeRow(3,fields.map(()=>"")));
    sheet=sheet.replace(/<sheetData(?:\s[^>]*)?>[\s\S]*?<\/sheetData>|<sheetData\s*\/>/,`<sheetData>${contents}</sheetData>`)
      .replace(/<dimension[^>]*\/>/,`<dimension ref="${index===2?"A1":`${String.fromCharCode(65+offset)}1:${end}${last}`}"/>`)
      .replace(/<autoFilter[^>]*\/>/,`<autoFilter ref="${String.fromCharCode(65+offset)}2:${end}${last}"/>`)
      .replace(/<pivotTableParts[\s\S]*?<\/pivotTableParts>/g,"");
    // Clear conditional formula ranges/old count boundaries without affecting column widths and print setup.
    sheet=sheet.replace(/sqref="([A-Z]+)3:([A-Z]+)\d+"/g,(_,a,b)=>`sqref="${a}3:${b}${last}"`);
    put(p,sheet);
    const rel=`xl/worksheets/_rels/sheet${index}.xml.rels`;
    if(cfb.find(archive,"/"+rel))put(rel,read(rel).replace(/<Relationship\b[^>]*Type="[^"]*pivotTable"[^>]*\/>/g,""));
  }
  put("xl/sharedStrings.xml",'<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>');
  let book=read("xl/workbook.xml").replace(/<pivotCaches[\s\S]*?<\/pivotCaches>/,"").replace(/<mc:AlternateContent[\s\S]*?<\/mc:AlternateContent>/g,"");
  book=book.replace(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g,(whole,attr,content)=>content.includes("KURIR!")?`<definedName${attr}>KURIR!$A$2:$K$${Math.max(3,rows.length+2)}</definedName>`:content.includes("ORION!")?`<definedName${attr}>ORION!$B$2:$D$${Math.max(3,rows.length+2)}</definedName>`:whole);
  put("xl/workbook.xml",book);
  put("xl/_rels/workbook.xml.rels",read("xl/_rels/workbook.xml.rels").replace(/<Relationship\b[^>]*Type="[^"]*(?:pivotCacheDefinition|calcChain)"[^>]*\/>/g,""));
  put("[Content_Types].xml",read("[Content_Types].xml").replace(/<Override\b[^>]*PartName="[^"]*(?:pivotTable|pivotCache|calcChain)[^"]*"[^>]*\/>/g,""));
  const remove=archive.FullPaths.filter((p:string)=>/\/pivot(?:Tables|Cache)\/|\/calcChain\.xml$/.test(p));
  remove.forEach((p:string)=>cfb.utils.cfb_del(archive,p));
  put("docProps/core.xml",'<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"/>');
  return new Uint8Array(cfb.write(archive,{type:"array",fileType:"zip",compression:true}));
}
