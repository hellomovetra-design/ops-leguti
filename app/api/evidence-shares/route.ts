import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth-token';
import { getSupabaseServerClient } from '@/lib/supabase';
import { evidenceKinds, EvidenceKind, evidenceRecord, evidenceHeaders } from '@/lib/evidence-share';
export const runtime='nodejs';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:evidenceHeaders});
export async function POST(req:NextRequest) {
  if(req.headers.get('origin')!==req.nextUrl.origin) return json({error:'Permintaan tidak diizinkan.'},403);
  const session=await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value,process.env.INTERNAL_AUTH_SECRET);
  if(!session) return json({error:'Silakan login.'},401);
  const db=getSupabaseServerClient();
  if(!db || !process.env.SUPABASE_SERVICE_ROLE_KEY) return json({error:'Penyimpanan link belum siap.'},503);
  try {
    const {kind,id,action}=await req.json();
    if(!evidenceKinds.includes(kind)||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||'')||!['create','revoke','status'].includes(action)) return json({error:'Permintaan tidak valid.'},400);
    const record=await evidenceRecord(db,kind as EvidenceKind,id);
    if(!record) return json({error:'Laporan tidak ditemukan.'},404);
    const admin=['super_admin','admin','spv','jr_spv','coordinator'].includes(session.role);
    if(!admin && (kind==='barkur'||record.owner!==session.email.toLowerCase())) return json({error:'Tidak memiliki akses laporan ini.'},403);
    if(action==='revoke') {
      const result=await db.from('ops_evidence_shares').update({revoked_at:new Date().toISOString()}).eq('kind',kind).eq('record_id',id);
      if(result.error) throw result.error;
      return json({url:null});
    }
    const existing=await db.from('ops_evidence_shares').select('token,revoked_at').eq('kind',kind).eq('record_id',id).maybeSingle();
    if(existing.error) throw existing.error;
    if(action==='status') return json({url:existing.data&&!existing.data.revoked_at?`/evidence/${existing.data.token}`:null});
    if(!record.photos.length) return json({error:'Belum ada foto untuk dibagikan.'},400);
    let token=existing.data?.token;
    if(!existing.data || existing.data.revoked_at) {
      token=randomBytes(32).toString('hex');
      const result=await db.from('ops_evidence_shares').upsert({kind,record_id:id,token,created_by:session.email,created_at:new Date().toISOString(),revoked_at:null},{onConflict:'kind,record_id'});
      if(result.error) throw result.error;
    }
    return json({url:`/evidence/${token}`});
  } catch {return json({error:'Link bukti belum dapat diproses. Pastikan migration public evidence sudah diterapkan.'},503);}
}
