export const MASTER_FIELDS = ["tgrid", "name", "leader", "shift", "vehicle", "area", "district", "zone", "kanit", "code", "kpi"] as const;
export const MASTER_HEADERS = ["ID KURIR", "NAMA KURIR", "LEADER", "SHIFT KERJA", "VICH", "AREA", "KEC", "zone", "Kanit", "KODE", "KPI"];
export const REQUIRED_MASTER_FIELDS = ["leader", "shift", "vehicle", "area", "district", "zone", "kanit"] as const;
export type MasterRow = { id: string; employee_nik: string | null; active: boolean; source_month: string | null } & Record<typeof MASTER_FIELDS[number], string>;
export type IncomingCourier = Partial<Record<typeof MASTER_FIELDS[number], string>> & { tgrid: string; name: string; row: string };
export const text = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ");
export const identity = (v: unknown) => text(v).toUpperCase();
export const personName = (v: unknown) => text(v).toLocaleLowerCase("id-ID");
export const missingMasterFields = (row: Partial<MasterRow>) => REQUIRED_MASTER_FIELDS.filter(field=>!text(row[field]));
export function normalizeCourier(raw: Record<string, unknown>, row: string): IncomingCourier {
  const obj = Object.fromEntries(Object.entries(raw).map(([k,v]) => [identity(k).replace(/[\s_-]+/g,"_"),v]));
  const mapping = ["ID_KURIR", "NAMA_KURIR", "LEADER", "SHIFT_KERJA", "VICH", "AREA", "KEC", "ZONE", "KANIT", "KODE", "KPI"];
  const item: any = { row };
  MASTER_FIELDS.forEach((field,i) => { if (obj[mapping[i]] !== undefined && text(obj[mapping[i]]) !== "") item[field] = text(obj[mapping[i]]); });
  item.tgrid = identity(item.tgrid); item.name = text(item.name);
  return item;
}
export function planImport(incoming: IncomingCourier[], records: MasterRow[], aliases: { tgrid: string; courier_id: string }[], decisions: Record<string,string> = {}) {
  const current = new Map(records.map(x=>[x.tgrid,x]));
  const byId = new Map(records.map(x=>[x.id,x]));
  const oldIds = new Map(aliases.map(x=>[x.tgrid,x.courier_id]));
  const claimed = new Set<string>();
  const entries: any[] = [], operations: any[] = [];
  const counts = { added:0, updated:0, unchanged:0, transitions:0, blocked:0, duplicates:0 };
  const grouped = new Map<string,IncomingCourier>(), conflicts=new Set<string>();
  for(const input of incoming){
    const previous=grouped.get(input.tgrid);
    if(!previous){grouped.set(input.tgrid,{...input});continue;}
    counts.duplicates++;
    if(MASTER_FIELDS.some(k=>input[k]!==undefined&&previous[k]!==undefined&&(k==="name"?personName(input[k])!==personName(previous[k]):text(input[k])!==text(previous[k])))) conflicts.add(input.tgrid);
    else for(const k of MASTER_FIELDS)if(previous[k]===undefined&&input[k]!==undefined)previous[k]=input[k];
  }
  for (const input of grouped.values()) {
    const entry: any = { ...input, changes: [], candidates: [] };
    const block = (message: string) => { entry.kind="blocked";entry.message=message;counts.blocked++;entries.push(entry); };
    if(conflicts.has(input.tgrid)){block("TGRID ganda dengan isian berbeda. Perbaiki file terlebih dahulu.");continue;}
    if (!/^TGR(?:FL)?[A-Z0-9]+$/.test(input.tgrid) || !input.name) { block("ID TGR/TGRFL dan nama kurir wajib valid.");continue; }
    if (input.kpi !== undefined && (!/^\d+(?:\.\d+)?$/.test(input.kpi) || !Number.isFinite(Number(input.kpi)))) { block("KPI harus berupa angka nonnegatif.");continue; }
    let record=current.get(input.tgrid);
    if (!record && oldIds.has(input.tgrid)) { block("Ini ID lama yang sudah diganti. Gunakan TGRID terbaru agar perubahan tidak terbalik.");continue; }
    if (!record && !input.tgrid.startsWith("TGRFL")) {
      const candidates=records.filter(x=>x.tgrid.startsWith("TGRFL") && personName(x.name)===personName(input.name));
      entry.candidates=candidates.map(x=>({id:x.id,tgrid:x.tgrid,name:x.name,employee_nik:x.employee_nik}));
      if (candidates.length) {
        const decision=decisions[input.tgrid];
        if (!decision) { entry.kind="transition";entry.message="Konfirmasi apakah ini personel freelance yang sama atau personel berbeda.";counts.blocked++;entries.push(entry);continue; }
        if (decision!=="new") { record=candidates.find(x=>x.id===decision);if(!record){block("Pilihan perubahan ID tidak valid.");continue;} }
      }
    }
    if (record && personName(record.name)!==personName(input.name)) {
      entry.identity_confirmation={before:record.name,after:input.name,nik:record.employee_nik};
      if(decisions[input.tgrid]!=="confirm-name"){block("TGRID sama tetapi nama berbeda. Konfirmasi hanya jika ini orang yang sama dengan koreksi nama.");continue;}
    }
    if (record && claimed.has(record.id)) { block("Personel yang sama muncul dengan dua ID di file ini. Sisakan ID terbaru saja.");continue; }
    if(record)claimed.add(record.id);
    const values = Object.fromEntries(MASTER_FIELDS.map(k=>[k,input[k]===undefined?record?.[k]??"":input[k]])) as Record<string,string>;
    const missing=missingMasterFields(values);
    if(missing.length){block(`Kolom wajib belum lengkap: ${missing.map(k=>MASTER_HEADERS[MASTER_FIELDS.indexOf(k)]).join(", ")}. Lengkapi dari data yang benar.`);continue;}
    // Capitalisation/spaces in names are not identity changes or reasons to write again.
    if(record && personName(values.name)===personName(record.name)) values.name=record.name;
    const changes=MASTER_FIELDS.filter(k=>text(record?.[k])!==text(values[k])).map(k=>({field:k,before:record?.[k]??"",after:values[k]}));
    entry.changes=changes;
    entry.kind=!record?"added":record.tgrid!==input.tgrid?"transitioned":changes.length?"updated":"unchanged";
    counts[entry.kind==="added"?"added":entry.kind==="transitioned"?"transitions":entry.kind==="updated"?"updated":"unchanged"]++;
    if(entry.kind!=="unchanged")operations.push({id:record?.id??null,values,changes,old_tgrid:record?.tgrid??null,employee_nik:record?.employee_nik??null});
    entries.push(entry);
  }
  return { entries, counts, operations };
}
