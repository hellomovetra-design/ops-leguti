import { getSupabaseServerClient } from "@/lib/supabase";
export const evidenceKinds = ['damage','problem','barkur'] as const;
export type EvidenceKind = typeof evidenceKinds[number];
export const validEvidenceToken = (token: string) => /^[a-f0-9]{64}$/.test(token);
export const evidenceHeaders = { 'Cache-Control':'private, no-store, max-age=0', 'X-Robots-Tag':'noindex, nofollow, noarchive', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff' };
export async function evidenceRecord(db: NonNullable<ReturnType<typeof getSupabaseServerClient>>, kind: EvidenceKind, id: string) {
  const table = { damage:'ops_damage_cases', problem:'ops_problems', barkur:'ops_barkur' }[kind];
  const fields = { damage:'awb,created_by,photos', problem:'awb,created_by_email', barkur:'awb,created_by,evidence' }[kind];
  const result = await db.from(table).select(fields).eq('id',id).maybeSingle();
  if (result.error) throw new Error('Penyimpanan bukti belum dapat diakses.');
  if (!result.data) return null;
  const row = result.data as any;
  let photos: {path:string;label:string}[];
  if (kind === 'problem') {
    const result = await db.from('ops_problem_photos').select('storage_path').eq('problem_id',id).order('created_at',{ascending:true}).order('id');
    if(result.error) throw new Error('Foto belum dapat diakses.');
    photos = (result.data || []).map((p:any,index:number)=>({path:p.storage_path,label:`Foto bukti ${index+1}`}));
  } else photos = ((kind === 'damage' ? row.photos : row.evidence) || []).map((p:any,index:number)=>({path:p.path,label:kind==='damage' && (p.slot??index)===0 ? 'Foto AWB' : `Foto bukti ${index+1}`}));
  return {awb:row.awb as string, owner:String(row.created_by_email || row.created_by || '').toLowerCase(), photos:photos.filter(p=>typeof p.path==='string' && p.path.length>0)};
}
