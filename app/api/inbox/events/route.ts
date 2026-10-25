import { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { INBOX_ADMIN_ROLES } from "@/lib/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  if (!session) return new Response(null, { status: 401 });
  const scope = req.nextUrl.searchParams.get("scope") || "user";
  if (!["admin", "user"].includes(scope)) return new Response(null, { status: 400 });
  const admin = scope === "admin";
  if (admin && !INBOX_ADMIN_ROLES.includes(session.role)) return new Response(null, { status: 403 });
  // HTTP 204 tells legacy EventSource clients not to reconnect. Inbox keeps
  // its authenticated bounded refresh; background Web Push is independent.
  return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
}
