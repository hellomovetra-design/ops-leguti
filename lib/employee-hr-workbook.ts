import * as XLSX from 'xlsx';
import { employeeSummaryExportRows } from './employee-summary-export';
const xml=(v:unknown)=>String(v??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

// App runtime export: preserve HR template styles, without copying its stale personnel or organization chart.
export function employeeHrWorkbook(template:Uint8Array,rows:Record<string,any>[],updatedAt:Date=new Date()){
  const book=XLSX.read(template,{type:'array'}),source=book.Sheets['LEGUTI MALOKO'];
  if(!source)throw new Error('Template database karyawan tidak ditemukan.');
  const matrix=employeeSummaryExportRows(rows);
  const cfb=(XLSX as any).CFB,input=cfb.read(template,{type:'array'}),output=cfb.utils.cfb_new();
  const read=(p:string)=>{const entry=cfb.find(input,'/'+p);if(!entry)throw new Error('Template HR tidak lengkap.');return new TextDecoder().decode(entry.content);};
  const put=(p:string,v:string)=>cfb.utils.cfb_add(output,'Root Entry/'+p,new TextEncoder().encode(v));
  const sheet=read(`xl/worksheets/sheet${book.SheetNames.indexOf('LEGUTI MALOKO')+1}.xml`);
  const year=new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',year:'numeric'}).format(updatedAt);
  const date=new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'long',year:'numeric'}).format(updatedAt);
  let styles=read('xl/styles.xml');
  const append=(name:string,items:string[])=>{
    const count=Number(styles.match(new RegExp(`<${name} count="(\\d+)"`))?.[1]);
    if(!Number.isFinite(count))throw new Error('Format template HR tidak valid.');
    styles=styles.replace(new RegExp(`<${name} count="\\d+"`),`<${name} count="${count+items.length}"`).replace(`</${name}>`,items.join('')+`</${name}>`);
    return count;
  };
  const font=(size:number,color:string,bold=false)=>`<font>${bold?'<b/>':''}<sz val="${size}"/><color rgb="FF${color}"/><name val="Arial"/></font>`;
  const f=append('fonts',[font(18,'102A43',true),font(10,'64748B'),font(10,'FFFFFF',true),font(10,'102A43')]);
  const fill=append('fills',['<fill><patternFill patternType="solid"><fgColor rgb="FF102A43"/><bgColor indexed="64"/></patternFill></fill>','<fill><patternFill patternType="solid"><fgColor rgb="FFF3F6FA"/><bgColor indexed="64"/></patternFill></fill>']);
  const border=append('borders',['<border><left/><right/><top/><bottom style="hair"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>']);
  const sourceXfs=styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1].match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g)||[];
  const sourceDateStyle=Number(sheet.match(/<c r="K2"[^>]* s="(\d+)"/)?.[1]);
  const dateFormat=Number(sourceXfs[sourceDateStyle]?.match(/numFmtId="(\d+)"/)?.[1]||14);
  const xf=(fontId:number,fillId:number,borderId:number,numFmt=0,alignment='left',wrap=false)=>`<xf numFmtId="${numFmt}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyNumberFormat="1"><alignment horizontal="${alignment}" vertical="center"${wrap?' wrapText="1"':''}/></xf>`;
  const s=append('cellXfs',[xf(f,0,0),xf(f+1,0,0),xf(f+2,fill,0,0,'center',true),xf(f+3,0,border,0,'left',true),xf(f+3,fill+1,border,0,'left',true),xf(f+3,0,border,dateFormat),xf(f+3,fill+1,border,dateFormat),xf(f+1,0,0,0,'right')]);
  const cell=(ref:string,value:unknown,style:number)=>`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  const heading=`<row r="1" ht="36" customHeight="1">${cell('A1',`DATA STRUKTUR KARYAWAN UPDATE ${year}`,s)}</row><row r="2" ht="24" customHeight="1">${cell('A2',`Tanggal update: ${date} · ${rows.length} karyawan`,s+1)}</row><row r="3" ht="12" customHeight="1"/>`;
  const contents=heading+matrix.map((values,i)=>`<row r="${i+4}" ht="${i===0?32:30}" customHeight="1">${values.map((value,j)=>{
    const col=String.fromCharCode(65+j),ref=col+(i+4),style=i===0?s+2:j===9?s+5+(i%2===0?1:0):s+3+(i%2===0?1:0);
    return typeof value==='number'?`<c r="${ref}" s="${style}" t="n"><v>${value}</v></c>`:cell(ref,value,style);
  }).join('')}</row>`).join('');
  const last=matrix.length+3,footer=last+2;
  const watermark=`<row r="${last+1}" ht="12" customHeight="1"/><row r="${footer}" ht="24" customHeight="1">${cell(`A${footer}`,'Developed by movetra.id',s+7)}</row>`;
  // Drop source column A (NIA), shifting widths and styles with their original fields.
  const cols=(sheet.match(/<cols>[\s\S]*?<\/cols>/)?.[0]||'').replace(/<col\b[^>]*\/>/g,tag=>{
    const min=Math.max(2,Number(tag.match(/min="(\d+)"/)?.[1])),max=Math.min(12,Number(tag.match(/max="(\d+)"/)?.[1]));
    return min>max?'':tag.replace(/min="\d+"/,`min="${min-1}"`).replace(/max="\d+"/,`max="${max-1}"`);
  });
  const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  put('xl/worksheets/sheet1.xml',`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:K${footer}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="3" ySplit="4" topLeftCell="D5" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="30"/>${cols}<sheetData>${contents}${watermark}</sheetData><autoFilter ref="A4:K${last}"/><mergeCells count="3"><mergeCell ref="A1:K1"/><mergeCell ref="A2:K2"/><mergeCell ref="A${footer}:K${footer}"/></mergeCells><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;LDeveloped by movetra.id&amp;RHalaman &amp;P / &amp;N</oddFooter></headerFooter></worksheet>`);
  put('xl/styles.xml',styles);put('xl/theme/theme1.xml',read('xl/theme/theme1.xml'));
  put('xl/workbook.xml',`<?xml version="1.0"?><workbook xmlns="${ns}" xmlns:r="${rel}"><bookViews><workbookView/></bookViews><sheets><sheet name="LEGUTI MALOKO" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">'LEGUTI MALOKO'!$4:$4</definedName><definedName name="_xlnm.Print_Area" localSheetId="0">'LEGUTI MALOKO'!$A$1:$K${footer}</definedName></definedNames></workbook>`);
  put('xl/_rels/workbook.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/><Relationship Id="rId3" Type="${rel}/theme" Target="theme/theme1.xml"/></Relationships>`);
  put('_rels/.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  put('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>');
  return new Uint8Array(cfb.write(output,{type:'array',fileType:'zip',compression:true}));
}
