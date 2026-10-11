import {NextRequest,NextResponse} from 'next/server';
import {SESSION_COOKIE,verifySessionToken} from '@/lib/auth-token';
import {getSupabaseServerClient} from '@/lib/supabase';
import {DAMAGE_ADMINS} from '@/lib/damage-case';
import {damageAssetValues} from '@/lib/damage-assets';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(req:NextRequest){
 const session=await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value,process.env.INTERNAL_AUTH_SECRET);
 if(!session)return json({error:'Silakan login.'},401);
 if(!DAMAGE_ADMINS.includes(session.role))return json({error:'Penambahan aset khusus Super Admin, Admin Pengelola, dan SPV.'},403);
 if(req.headers.get('origin')!==req.nextUrl.origin)return json({error:'Permintaan tidak diizinkan.'},403);
 if(Number(req.headers.get('content-length')||0)>8192)return json({error:'Isian terlalu panjang.'},413);
 try{
  const values=damageAssetValues(await req.json()),db=getSupabaseServerClient(session.email);
  if(!db||!process.env.SUPABASE_SERVICE_ROLE_KEY)return json({error:'Penyimpanan aset belum siap.'},503);
  // Unique normalized keys deduplicate retries and concurrent saves, without overwriting existing metadata.
  const saved=await db.from(values.table).upsert(values.fields,{onConflict:values.key,ignoreDuplicates:true});
  if(saved.error)return json({error:'Aset belum berhasil disimpan. Silakan coba lagi.'},503);
  const current=await db.from(values.table).select('*').eq(values.key,values.fields[values.key as keyof typeof values.fields]).maybeSingle();
  if(current.error||!current.data)return json({error:'Penyimpanan belum terkonfirmasi. Coba simpan kembali.'},503);
  if(!current.data.active)return json({error:'Aset sudah terdaftar tetapi nonaktif. Hubungi pengelola untuk mengaktifkannya.'},409);
  const item=values.kind==='warehouse'?{plate:current.data.name,vehicle_code:'',vehicle_type:''}:{plate:current.data.plate,vehicle_code:current.data.vehicle_code,vehicle_type:current.data.vehicle_type};
  return json({ok:true,item});
 }catch(error){return json({error:error instanceof Error?error.message:'Isian aset tidak valid.'},400);}
}
