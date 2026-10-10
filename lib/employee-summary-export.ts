import { employeeStatus } from './employee-status';
import { employeeEmployment } from './employee-employment';

export const HR_HEADERS=['NIK','TGRID','FULL NAME','POSITION','DEPT','HUB','LEVEL','SUPERIOR 1','STATUS','TGL MASUK','KET'];
export function employeeSummaryExportRows(rows: Record<string, any>[]) {
  const text=(value:unknown)=>String(value??'');
  return [
    HR_HEADERS,
    ...rows.map(row=>{
      const status=employeeStatus(row),type={permanent:'PKWTT',contract:'PKWT',outsource:'OUTSOURCE',unknown:''}[employeeEmployment(row)];
      return [text(row.nik),text(row.tgrid),text(row.name),text(row.position),text(row.dept),text(row.hub),text(row.level),text(row.superior),type,hrDate(row.start_date),status==='resigned'?'Resign / Belum Diganti':status==='inactive'?'Nonaktif':text(row.ket)];
    })
  ];
}

function hrDate(value:unknown):string|number {
  if(typeof value==='number'&&Number.isFinite(value))return value;
  const raw=String(value??''),match=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if(!match)return raw;
  const date=Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])),parsed=new Date(date);
  if(parsed.getUTCFullYear()!==Number(match[1])||parsed.getUTCMonth()!==Number(match[2])-1||parsed.getUTCDate()!==Number(match[3]))return raw;
  return (date-Date.UTC(1899,11,30))/86400000;
}
