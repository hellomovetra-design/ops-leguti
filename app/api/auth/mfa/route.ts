import { NextRequest,NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase";
import { createSessionToken,SESSION_COOKIE,SESSION_MAX_AGE,requiresDashboardMfa } from "@/lib/auth-token";
import { MFA_COOKIE,mfaCookieOptions,openMfaPending } from "@/lib/mfa-login";
import { loginDestination } from "@/lib/access-policy";
export const runtime="nodejs";
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});
export async function POST(req:NextRequest){
 if(req.headers.get("origin")!==req.nextUrl.origin)return json({error:"Permintaan tidak valid."},403);
 if(Number(req.headers.get("content-length")||0)>4096)return json({error:"Permintaan terlalu besar."},413);
 try{
  const body=await req.json();
  if(body?.action==="cancel"){
   const pending=await openMfaPending(req.cookies.get(MFA_COOKIE)?.value,process.env.INTERNAL_AUTH_SECRET);
   const db=getSupabaseServerClient();
   if(pending&&db)await db.from("ops_mfa_login_challenges").update({consumed_at:new Date().toISOString()}).eq("id",pending.id).eq("email",pending.email);
   const response=json({ok:true});response.cookies.set(MFA_COOKIE,"",{...mfaCookieOptions,maxAge:0});return response;
  }
  if(!["start","verify"].includes(body?.action))return json({error:"Permintaan tidak valid."},400);
  const pending=await openMfaPending(req.cookies.get(MFA_COOKIE)?.value,process.env.INTERNAL_AUTH_SECRET);
  if(!pending)return json({error:"Sesi verifikasi habis. Masuk kembali dengan kata sandi."},401);
  const db=getSupabaseServerClient();if(!db)return json({error:"Penyimpanan verifikasi belum siap."},503);
  const found=await db.from("ops_mfa_login_challenges").select("*").eq("id",pending.id).eq("email",pending.email).maybeSingle();
  if(found.error)return json({error:"Penyimpanan verifikasi belum siap."},503);
  const record=found.data;
  if(!record||record.user_id!==pending.user_id||record.consumed_at||Date.parse(record.expires_at)<=Date.now())return json({error:"Sesi verifikasi habis. Silakan masuk kembali."},401);
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const session=await client.auth.setSession({access_token:pending.access_token,refresh_token:pending.refresh_token});
  if(session.error||session.data.user?.id!==pending.user_id)return json({error:"Sesi verifikasi tidak valid. Silakan masuk kembali."},401);
  if(body.action==="start"){
   if(record.factor_id)return json({error:"Verifikasi sudah dimulai. Jika QR hilang, mulai ulang login."},409);
   const factors=await client.auth.mfa.listFactors();
   if(factors.error)return json({error:"Google Authenticator belum tersedia. Periksa pengaturan MFA Supabase."},503);
   const verified=factors.data.totp.find(f=>f.status==="verified");
   let factorId=verified?.id,qr:string|undefined,secret:string|undefined,enrolled=false;
   if(!factorId){
    for(const factor of factors.data.all.filter(f=>f.factor_type==="totp"&&f.status==="unverified")){
     const removed=await client.auth.mfa.unenroll({factorId:factor.id});if(removed.error)return json({error:"Pemasangan sebelumnya belum dapat dibersihkan. Hubungi administrator."},503);
    }
    const result=await client.auth.mfa.enroll({factorType:"totp",friendlyName:"OPS Movetra",issuer:"OPS Movetra"});
    if(result.error)return json({error:"Pemasangan Authenticator belum tersedia. Hubungi administrator."},503);
    factorId=result.data.id;secret=result.data.totp.secret;
    const svg=result.data.totp.qr_code;
    qr=svg.startsWith("data:image/svg+xml")?svg:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;enrolled=true;
   }
   const saved=await db.from("ops_mfa_login_challenges").update({factor_id:factorId}).eq("id",pending.id).is("factor_id",null).is("consumed_at",null).select("id").maybeSingle();
   if(saved.error||!saved.data){if(enrolled)await client.auth.mfa.unenroll({factorId:factorId!});return json({error:"Sesi berubah. Silakan mulai ulang login."},409);}
   return json({setup:enrolled,...(enrolled?{qr,secret}:{})});
  }
  if(typeof body.code!=="string"||!/^\d{6}$/.test(body.code))return json({error:"Masukkan kode Authenticator 6 angka."},400);
  const attempt=await db.rpc("ops_claim_mfa_attempt",{challenge:pending.id,account_email:pending.email});
  if(attempt.error)return json({error:"Verifikasi belum dapat diproses."},503);
  if(attempt.data!==true)return json({error:"Batas percobaan tercapai. Tunggu 15 menit lalu masuk kembali."},429);
  const verified=await client.auth.mfa.challengeAndVerify({factorId:record.factor_id,code:body.code});
  if(verified.error)return json({error:"Kode salah atau sudah kedaluwarsa. Gunakan kode terbaru dari Authenticator."},401);
  const assurance=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if(assurance.error||assurance.data.currentLevel!=="aal2")return json({error:"Verifikasi dua langkah belum berhasil."},401);
  const roleResult=await db.from("ops_users").select("role").eq("email",pending.email).maybeSingle();
  if(roleResult.error)return json({error:"Akses akun belum dapat diperiksa."},503);
  const primary=(process.env.INTERNAL_SUPER_ADMIN_EMAIL||"ibadnarpatih@gmail.com").trim().toLowerCase();
  const role=pending.email===primary?"super_admin":roleResult.data?.role;
  if(!requiresDashboardMfa(role))return json({error:"Akses akun berubah. Silakan masuk kembali."},403);
  const finished=await db.from("ops_mfa_login_challenges").update({consumed_at:new Date().toISOString()}).eq("id",pending.id).is("consumed_at",null).gt("expires_at",new Date().toISOString()).select("id").maybeSingle();
  if(finished.error||!finished.data)return json({error:"Sesi verifikasi sudah dipakai atau kedaluwarsa. Silakan masuk kembali."},409);
  const token=await createSessionToken(pending.email,role,process.env.INTERNAL_AUTH_SECRET!,pending.employee_nik,Math.floor(Date.now()/1000));
  const response=json({ok:true,role,redirect:loginDestination(role,pending.next)});
  response.cookies.set(SESSION_COOKIE,token,{httpOnly:true,sameSite:"strict",secure:process.env.NODE_ENV==="production",path:"/",maxAge:SESSION_MAX_AGE});
  response.cookies.set(MFA_COOKIE,"",{...mfaCookieOptions,maxAge:0});
  return response;
 }catch{return json({error:"Verifikasi belum dapat diproses. Coba kembali."},503);}
}
