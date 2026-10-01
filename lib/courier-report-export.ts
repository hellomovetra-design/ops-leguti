import * as XLSX from "xlsx";
import { CHECK_COLUMNS, CourierCheck, deliveryArea } from "./courier-checks";

export function documentationLinks(item: CourierCheck, origin: string) {
  return [...new Set([item.documentation_url, ...(item.photos || []).map(photo => photo.url)].filter(Boolean).map(url => {
    try { const parsed=new URL(url,origin);return ["http:","https:"].includes(parsed.protocol)?parsed.href:""; } catch { return ""; }
  }).filter(Boolean))];
}
const xml=(value: unknown)=>String(value??"").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");

// Fill the original template's XML without a workbook rewrite that drops print settings/styles.
// SheetJS is already a project dependency and is loaded only when the user exports.
export function courierReportXlsx(template: ArrayBuffer, items: CourierCheck[], origin: string): Uint8Array {
  const cfb=(XLSX as any).CFB;
  const archive=cfb.read(new Uint8Array(template),{type:"array"});
  const read=(path:string)=>new TextDecoder().decode(cfb.find(archive,"/"+path)?.content);
  const put=(path:string,value:string)=>cfb.utils.cfb_add(archive,"Root Entry/"+path,new TextEncoder().encode(value));
  let sheet=read("xl/worksheets/sheet1.xml"), styles=read("xl/styles.xml"),book=read("xl/workbook.xml");
  if(!sheet.includes('ref="A1:N33"')||!sheet.includes('r="N1"')||!styles.includes('cellXfs count="13"'))throw new Error("Template laporan tidak sesuai. Silakan hubungi administrator.");
  const header=sheet.match(/<row r="1"[\s\S]*?<\/row>/)?.[0];
  if(!header)throw new Error("Header template tidak ditemukan.");
  // Keep the template guidance below the populated table, even beyond its original 15 records.
  const end=Math.max(16,items.length+1),shift=end-16,cols=[19,18,21,23,13,16,19,20,24,18,28,20,17,27];
  const guidance=(sheet.match(/<row r="(?:19|2\d|3[0-3])"[\s\S]*?<\/row>/g)||[]).join("").replace(/r="([A-N]?)(\d+)"/g,(_,col,n)=>`r="${col}${Number(n)+shift}"`);
  const rows=Array.from({length:end-1},(_,i)=>{
    const record=items[i],r=i+2;
    const values=CHECK_COLUMNS.map(([key])=>!record?"":key==="documentation_url"?documentationLinks(record,origin).join("\n"):key==="inspection_time"?record.inspection_time.slice(0,5):key==="delivery_area"?deliveryArea(record.delivery_area):record[key]);
    const lines=Math.max(1,...values.map((value,index)=>String(value??"").split("\n").reduce((total,line)=>total+Math.max(1,Math.ceil(line.length/(cols[index]-2))),0)));
    const height=Math.min(409,Math.max(42,lines*12+10));
    const cells=values.map((value,index)=>{
      const ref=String.fromCharCode(65+index)+r;
      let style=10,number:number|undefined;
      if(record&&index===0){number=(Date.parse(record.inspection_date+"T00:00:00Z")-Date.UTC(1899,11,30))/86400000;style=13;}
      if(record&&index===12){const [h,m]=record.inspection_time.split(":").map(Number);number=(h*60+m)/1440;style=14;}
      if(record&&(index===7||index===8))number=Number(value);
      if(number!==undefined&&Number.isFinite(number))return `<c r="${ref}" s="${style}" t="n"><v>${number}</v></c>`;
      return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join("");
    return `<row r="${r}" ht="${height}" customHeight="1">${cells}</row>`;
  }).join("");
  sheet=sheet.replace(/<sheetData>[\s\S]*?<\/sheetData>/,`<sheetData>${header}${rows}${guidance}</sheetData>`)
    .replace('ref="A1:N33"',`ref="A1:N${33+shift}"`).replace('autoFilter ref="A1:N16"',`autoFilter ref="A1:N${end}"`)
    .replace(/<mergeCells[\s\S]*?<\/mergeCells>/,block=>block.replace(/([A-N])(\d+)/g,(_,col,n)=>col+(Number(n)+shift)))
    .replace(/sqref="([JF])2:([JF])16"/g,(_,a,b)=>`sqref="${a}2:${b}${end}"`);
  const hyperlinks=items.map((item,index)=>({ref:`K${index+2}`,url:documentationLinks(item,origin)[0]})).filter(link=>!!link.url);
  if(hyperlinks.length){
    sheet=sheet.replace("<printOptions",`<hyperlinks>${hyperlinks.map((link,index)=>`<hyperlink xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ref="${link.ref}" r:id="rId${index+1}"/>`).join("")}</hyperlinks><printOptions`);
    put("xl/worksheets/_rels/sheet1.xml.rels",`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hyperlinks.map((link,index)=>`<Relationship Id="rId${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(link.url)}" TargetMode="External"/>`).join("")}</Relationships>`);
  }
  book=book.replaceAll("$N$16",`$N$${end}`).replaceAll("$N$33",`$N$${33+shift}`);
  styles=styles.replace('<numFmts count="0"/>','<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="hh:mm &quot;WIB&quot;"/></numFmts>')
    .replace('cellXfs count="13"','cellXfs count="15"').replace('</cellXfs>',[164,165].map(id=>`<xf numFmtId="${id}" fontId="2" fillId="0" borderId="1" applyNumberFormat="1" applyAlignment="1" xfId="0"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>`).join("")+"</cellXfs>");
  put("xl/worksheets/sheet1.xml",sheet);put("xl/workbook.xml",book);put("xl/styles.xml",styles);
  return new Uint8Array(cfb.write(archive,{type:"array",fileType:"zip",compression:true}));
}
