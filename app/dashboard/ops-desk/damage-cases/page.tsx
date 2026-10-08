import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { DAMAGE_ADMINS } from "@/lib/damage-case";
import { DamageCasePanel } from "@/components/damage-case-panel";
export default async function Page() {
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value,process.env.INTERNAL_AUTH_SECRET);
  if (!session) redirect("/login");
  if (!DAMAGE_ADMINS.includes(session.role)) redirect("/pwa");
  return <DamageCasePanel admin/>;
}
