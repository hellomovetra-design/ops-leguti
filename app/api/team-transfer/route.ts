import {NextRequest,NextResponse} from 'next/server';
import {SESSION_COOKIE,verifySessionToken} from '@/lib/auth-token';
import {getSupabaseServerClient} from '@/lib/supabase';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function context(req:NextRequest){
 const session=await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value,process.env.INTERNAL_AUTH_SECRET);
 if(!session)return {error:json({error:'Silakan login.'},401)};
 if(!['super_admin','admin','spv'].includes(session.role))return {error:json({error:'Akses pengelola diperlukan.'},403)};
 const db=getSupabaseServerClient(session.email);
 if(!db||!process.env.SUPABASE_SERVICE_ROLE_KEY)return {error:json({error:'Database belum siap.'},503)};
 return {db};
}
const failure=(error:{code?:string;message?:string})=>['PGRST202','42883'].includes(error.code||'')?'Fitur belum siap. Jalankan SQL 20261010_transfer_team.sql di Supabase.':error.message||'Pemindahan belum dapat diproses.';
export async function GET(req:NextRequest){
 const ctx=await context(req);if(ctx.error)return ctx.error;
 const from=req.nextUrl.searchParams.get('from')||'',to=req.nextUrl.searchParams.get('to')||'';
 if(from&&to){const result=await ctx.db!.rpc('ops_transfer_team',{p_from:from,p_to:to,p_apply:false});return result.error?json({error:failure(result.error)},400):json(result.data);}
 const items:any[]=[];
 for(let offset=0;;offset+=1000){const result=await ctx.db!.from('ops_employees').select('nik,name,position,hub,active').order('nik').range(offset,offset+999);if(result.error)return json({error:'Daftar karyawan belum dapat dimuat.'},503);items.push(...result.data);if(result.data.length<1000)break;}
 return json({items});
}
export async function POST(req:NextRequest){
 const ctx=await context(req);if(ctx.error)return ctx.error;
 if(req.headers.get('origin')!==req.nextUrl.origin)return json({error:'Permintaan tidak diizinkan.'},403);
 try{
  const body=await req.json();
  if(typeof body.from!=='string'||typeof body.to!=='string'||body.from===body.to||!body.from||!body.to||body.from.length>80||body.to.length>80||!Array.isArray(body.members)||!body.members.length||body.members.length>1000||!body.expected)return json({error:'Pilih atasan dan anggota tim melalui pratinjau.'},400);
  const result=await ctx.db!.rpc('ops_transfer_team',{p_from:body.from,p_to:body.to,p_members:body.members,p_expected:body.expected,p_apply:true});
  return result.error?json({error:failure(result.error)},409):json(result.data);
 }catch{return json({error:'Permintaan tidak valid.'},400);}
}
