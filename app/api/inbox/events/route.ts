import { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { getSupabaseServerClient } from "@/lib/supabase";
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
  const db = getSupabaseServerClient();
  if (!db || !process.env.SUPABASE_SERVICE_ROLE_KEY) return new Response(null, { status: 503 });
  const email = session.email.trim().toLowerCase();
  const encoder = new TextEncoder();
  let dispose = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let expiry: ReturnType<typeof setTimeout> | undefined;
      const write = (value: string) => { if (!closed) controller.enqueue(encoder.encode(value)); };
      const channel = db.channel(`inbox-server-${crypto.randomUUID()}`);
      dispose = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat); clearTimeout(expiry);
        req.signal.removeEventListener("abort", dispose);
        void db.removeChannel(channel);
        try { controller.close(); } catch { /* Cancellation already closed the stream. */ }
      };
      // Only invalidations reach the browser. Message content stays behind the
      // existing authenticated API; no service-role key or DB payload is sent.
      const changed = () => write('event: change\ndata: {}\n\n');
      channel.on("postgres_changes", {
        event: "*", schema: "public", table: "ops_inbox_threads",
        ...(admin ? {} : { filter: `owner_email=eq.${email}` }),
      }, changed).on("postgres_changes", {
        event: "*", schema: "public", table: "ops_inbox_reads", filter: `email=eq.${email}`,
      }, changed).subscribe(status => {
        if (status === "SUBSCRIBED") write('event: change\ndata: {}\n\n');
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") dispose();
      });
      write("retry: 1500\n\n");
      heartbeat = setInterval(() => write(": heartbeat\n\n"), 15000);
      // Reconnect before Vercel's deadline, and revalidate the session each time.
      expiry = setTimeout(dispose, Math.min(55000, Math.max(1, session.exp * 1000 - Date.now())));
      req.signal.addEventListener("abort", dispose, { once: true });
      if (req.signal.aborted) dispose();
    },
    cancel() { dispose(); },
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream", "Cache-Control": "private, no-cache, no-transform",
    "X-Accel-Buffering": "no",
  } });
}
