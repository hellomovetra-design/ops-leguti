import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { SANCTION_ADMINS } from "@/lib/employee-sanctions";
import { EmployeeSanctionsPanel } from "@/components/employee-sanctions-panel";
export default async function Page() {
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  if (!session) redirect("/login");
  if (!SANCTION_ADMINS.includes(session.role)) redirect("/pwa");
  return <EmployeeSanctionsPanel admin/>;
}
