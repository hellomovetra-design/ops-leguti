import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase';
import { fetchFromImageKit } from '@/lib/imagekit';
import { evidenceRecord, evidenceHeaders, validEvidenceToken, EvidenceKind } from '@/lib/evidence-share';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const missing=()=>NextResponse.json({error:'Tautan tidak tersedia atau sudah dinonaktifkan.'},{status:404,headers:evidenceHeaders});
export async function GET(req:NextRequest,{params}:{params:Promise<{token:string}>}) {
  const {token}=await params;
  if(!validEvidenceToken(token)) return missing();
  const db=getSupabaseServerClient();
  if(!db || !process.env.SUPABASE_SERVICE_ROLE_KEY) return missing();
  try {
    const share=await db.from('ops_evidence_shares').select('kind,record_id').eq('token',token).is('revoked_at',null).maybeSingle();
    if(share.error||!share.data) return missing();
    const kind=share.data.kind as EvidenceKind;
    const record=await evidenceRecord(db,kind,share.data.record_id);
    if(!record || !record.photos.length) return missing();
    const indexParam=req.nextUrl.searchParams.get('photo');
    if(indexParam===null) return NextResponse.json({awb:record.awb,title:{damage:'Damage Case',problem:'Problem Barang',barkur:'BARKUR'}[kind],photos:record.photos.map((p,index)=>({label:p.label,url:`/api/evidence/${token}?photo=${index}`}))},{headers:evidenceHeaders});
    if(!/^\d+$/.test(indexParam)) return missing();
    const photo=record.photos[Number(indexParam)];
    if(!photo) return missing();
    let body:BodyInit|null, mime:string;
    if(photo.path.startsWith('imagekit:')) {
      const file=await fetchFromImageKit(photo.path.slice(9));
      if(!file.ok) return missing();
      body=file.body; mime=file.headers.get('content-type')||'';
    } else {
      const bucket={damage:'ops-damage-photos',problem:'ops-problem-photos',barkur:'ops-barkur-evidence'}[kind];
      const file=await db.storage.from(bucket).download(photo.path);
      if(file.error||!file.data) return missing();
      body=file.data; mime=file.data.type;
    }
    if(!/^image\/(jpeg|png|webp)$/i.test(mime)) return missing();
    return new NextResponse(body,{headers:{...evidenceHeaders,'Content-Type':mime,'Content-Disposition':'inline'}});
  } catch {return missing();}
}
