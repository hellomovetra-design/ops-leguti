import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { DAILY_ADMIN_ROLES } from "@/lib/problem-solving-daily";
import { AdminDailyPanel } from "@/components/admin-daily-panel";

export default async function Page() {
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  if (!session) redirect("/login");
  if (!DAILY_ADMIN_ROLES.includes(session.role)) redirect("/pwa");
  return <AdminDailyPanel/>;
}
