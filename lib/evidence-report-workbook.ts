import * as XLSX from 'xlsx';
export function evidenceReportWorkbook(csv:string,name:string){
 // Read all cells as literal text: AWB/NIK retain zeros and untrusted text cannot become formulas.
 const book=XLSX.read(csv,{type:'string',raw:true}),sheet=book.Sheets[book.SheetNames[0]];
 const range=XLSX.utils.decode_range(sheet['!ref']||'A1');
 for(let row=range.s.r+1;row<=range.e.r;row++)for(let col=range.s.c;col<=range.e.c;col++){
  const cell=sheet[XLSX.utils.encode_cell({r:row,c:col})];if(!cell)continue;
  const header=String(sheet[XLSX.utils.encode_cell({r:0,c:col})]?.v||'');
  if(!/^LINK (FOTO BUKTI|GOOGLE DRIVE)$/.test(header))continue;
  const text=String(cell.v||'');const publicLink=text.match(/https?:\/\/[^\s]+\/evidence\/[a-f0-9]{64}\b/)?.[0];
  const driveLink=text.match(/https:\/\/(?:drive|docs)\.google\.com\/[^\s]+/)?.[0];
  if(publicLink||driveLink)cell.l={Target:publicLink||driveLink!};
 }
 sheet['!cols']=Array.from({length:range.e.c+1},(_,col)=>({wch:/LINK|BUKTI/.test(String(sheet[XLSX.utils.encode_cell({r:0,c:col})]?.v))?65:col===0?12:27}));
 sheet['!rows']=Array.from({length:range.e.r+1},(_,row)=>({hpt:row===0?30:27}));sheet['!autofilter']={ref:sheet['!ref']!};
 const output=XLSX.utils.book_new();XLSX.utils.book_append_sheet(output,sheet,name);
 return XLSX.write(output,{type:'buffer',bookType:'xlsx'});
}
