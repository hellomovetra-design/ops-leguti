import { MobileRequestApp } from "@/components/mobile-request-app";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { getSupabaseServerClient } from "@/lib/supabase";
import { linkedEmployee } from "@/lib/employee-access";
import { sanctionRecorder } from "@/lib/employee-sanctions";

export default async function Page() {
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  if (!session) redirect("/login");
  let canRecordSanctions = session.role === "super_admin";
  if (!canRecordSanctions) {
    const db = getSupabaseServerClient();
    try { canRecordSanctions = !!db && sanctionRecorder(await linkedEmployee(db, session.email)); }
    catch { /* No privilege is assumed if employee lookup is unavailable. */ }
  }
  return <MobileRequestApp initialCanRecordSanctions={canRecordSanctions}/>;
}
