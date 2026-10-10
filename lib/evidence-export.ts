import {randomBytes} from 'node:crypto';
import {EvidenceKind,validEvidenceToken} from './evidence-share';
// Export explicitly publishes photo galleries. Reuse existing links and never reactivate revoked links.
export async function exportEvidenceLinks(db:any,kind:EvidenceKind,ids:string[],actor:string,origin:string){
 const links=new Map<string,string>();
 if(!ids.length)return links;
 if(!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Penyimpanan link publik belum siap.');
 const unique=[...new Set(ids)];
 for(let i=0;i<unique.length;i+=500){
  const batch=unique.slice(i,i+500);
  const read=()=>db.from('ops_evidence_shares').select('record_id,token,revoked_at').eq('kind',kind).in('record_id',batch);
  const existing=await read();if(existing.error)throw new Error('Link publik belum dapat dibuat. Pastikan SQL public evidence sudah dijalankan.');
  const found=new Set((existing.data||[]).map((row:any)=>row.record_id));
  const missing=batch.filter(id=>!found.has(id)).map(id=>({kind,record_id:id,token:randomBytes(32).toString('hex'),created_by:actor,revoked_at:null}));
  if(missing.length){const saved=await db.from('ops_evidence_shares').upsert(missing,{onConflict:'kind,record_id',ignoreDuplicates:true});if(saved.error)throw new Error('Pembuatan link publik gagal. Unduh ulang laporan.');}
  const current=await read();if(current.error)throw new Error('Link publik belum dapat dimuat.');
  for(const row of current.data||[]){if(row.revoked_at)continue;if(!validEvidenceToken(row.token))throw new Error('Link bukti tidak valid.');links.set(row.record_id,`${origin}/evidence/${row.token}`);}
 }
 return links;
}
