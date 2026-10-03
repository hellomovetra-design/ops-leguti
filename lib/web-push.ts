import webpush from "web-push";
import { getSupabaseServerClient } from "./supabase";

// Accept only known browser push services, never an arbitrary outbound URL.
export function validPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.port && !u.hash &&
      (u.hostname === "fcm.googleapis.com" || u.hostname === "updates.push.services.mozilla.com" ||
       u.hostname === "web.push.apple.com" || u.hostname.endsWith(".push.apple.com"));
  } catch { return false; }
}
export function pushConfigured() {
  return !!(process.env.WEB_PUSH_PUBLIC_KEY && process.env.WEB_PUSH_PRIVATE_KEY && process.env.WEB_PUSH_SUBJECT && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
export function inboxPushDestination(value: unknown, notificationId: string) {
  if (typeof value === "string" && /^\/(?:pwa\?inbox=|dashboard\/ops-desk\/inbox\?thread=)[0-9a-f-]{36}$/i.test(value)) return value;
  return `/pwa?notification=${encodeURIComponent(notificationId)}`;
}
export async function dispatchPush() {
  if (!pushConfigured()) return;
  const db = getSupabaseServerClient();
  if (!db) return;
  webpush.setVapidDetails(process.env.WEB_PUSH_SUBJECT!, process.env.WEB_PUSH_PUBLIC_KEY!, process.env.WEB_PUSH_PRIVATE_KEY!);
  const claimed = await db.rpc("ops_claim_push_deliveries");
  if (claimed.error) { console.error("Push queue unavailable:", claimed.error.code); return; }
  await Promise.all((claimed.data || []).map(async (job: any) => {
    try {
      if (!validPushEndpoint(job.endpoint)) throw new Error("Invalid push endpoint");
      // Avoid displaying AWBs, email addresses or report contents on lock screens.
      await webpush.sendNotification({ endpoint: job.endpoint, keys: { p256dh: job.p256dh, auth: job.auth } }, JSON.stringify({
        title: "OPS LEGUTI", body: job.title, id: job.notification_id,
        url: inboxPushDestination(job.destination, job.notification_id),
      }), { TTL: 86400, urgency: "normal", timeout: 5000 });
      const saved = await db.from("ops_push_deliveries").update({ sent_at: new Date().toISOString(), locked_at: null, last_error: null }).eq("id", job.id);
      if (saved.error) console.error("Push delivery receipt failed:", saved.error.code);
    } catch (error) {
      const code = Number((error as { statusCode?: number }).statusCode || 0);
      if (code === 404 || code === 410) {
        await db.from("ops_push_subscriptions").delete().eq("id", job.subscription_id);
      } else {
        await db.from("ops_push_deliveries").update({ locked_at: null, next_attempt_at: new Date(Date.now() + Math.min(3600, 30 * 2 ** job.attempts) * 1000).toISOString(), last_error: code ? `HTTP ${code}` : "Delivery failed" }).eq("id", job.id);
      }
    }
  }));
}
