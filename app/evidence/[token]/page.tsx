import { PublicEvidence } from '@/components/public-evidence';
export const dynamic='force-dynamic';
export const metadata={title:'Foto Bukti | OPS LEGUTI',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{token:string}>}) {
  const {token}=await params;
  return <PublicEvidence token={token}/>;
}
