import { notFound } from "next/navigation";
import { DAMAGE_UUID } from "@/lib/damage-case";
import { DamageEvidencePage } from "@/components/damage-case-panel";
export default async function Page({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;if(!DAMAGE_UUID.test(id))notFound();
  return <DamageEvidencePage id={id}/>;
}
