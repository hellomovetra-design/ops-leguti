import {NextRequest,NextResponse} from 'next/server';
import {SESSION_COOKIE,verifySessionToken} from '@/lib/auth-token';
import {getSupabaseServerClient} from '@/lib/supabase';
import {applyPersonnelFilters,personnelFilters} from '@/lib/personnel-history';
export async function GET(req:NextRequest){
 const session=await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value,process.env.INTERNAL_AUTH_SECRET);
 if(!session||!['super_admin','admin','spv'].includes(session.role))return NextResponse.json({error:'Akses pengelola diperlukan.'},{status:403});
 try{
  const filters=personnelFilters(req.nextUrl.searchParams),offset=Number(req.nextUrl.searchParams.get('offset')||0),exporting=req.nextUrl.searchParams.get('export')==='1';
  if(!Number.isSafeInteger(offset)||offset<0)throw new Error('Halaman tidak valid.');
  const db=getSupabaseServerClient();if(!db)return NextResponse.json({error:'Database belum dapat diakses.'},{status:503});
  const items:any[]=[];
  for(let start=exporting?0:offset;;start+=1000){
   const limit=exporting?1000:51;
   const result=await applyPersonnelFilters(db.from('ops_personnel_changes').select('id,employee_nik,employee_name,action,actor_email,before_data,after_data,created_at'),filters).order('created_at',{ascending:false}).order('id').range(start,start+limit-1);
   if(result.error)return NextResponse.json({error:['42P01','PGRST205'].includes(result.error.code)?'Riwayat belum siap. Jalankan SQL 20261010_personnel_history.sql di Supabase.': 'Riwayat belum dapat dimuat.'},{status:503});
   items.push(...(result.data||[]));if(!exporting||(result.data||[]).length<limit)break;
  }
  return NextResponse.json({items:exporting?items:items.slice(0,50),has_more:!exporting&&items.length>50},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Filter tidak valid.'},{status:400});}
}
