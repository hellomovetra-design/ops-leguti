"use client";
import { useEffect, useRef, useState } from "react";
import { Bell, Loader2 } from "lucide-react";

async function save(action: string, subscription: PushSubscription) {
  const r = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, subscription: subscription.toJSON() }) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Notifikasi perangkat belum tersedia.");
  return data;
}
export function PwaPushSettings({ audience = "user" }: { audience?: "user" | "admin" }) {
  const [message, setMessage] = useState(""), [active, setActive] = useState(false), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [key, setKey] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (alive) setMessage("Perangkat belum mendukung notifikasi. Pada iPhone, instal ke Layar Utama dan buka dari ikon aplikasi."); return;
      }
      try {
        const r = await fetch("/api/push", { cache: "no-store" }); const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        const worker = await navigator.serviceWorker.register("/ops-sw.js", { scope: "/", updateViaCache: "none" });
        const sub = await worker.pushManager.getSubscription();
        const registered = sub ? await save("status", sub) : { active: false };
        if (alive) { setKey(data.publicKey || ""); setActive(registered.active && Notification.permission === "granted"); setReady(true); setMessage(data.configured ? audience === "admin" ? "Terima request baru saat dashboard berada di belakang atau ditutup." : "Terima pembaruan admin meskipun aplikasi ditutup." : "Notifikasi perangkat sedang disiapkan oleh pengelola."); }
      } catch (e) { if (alive) setMessage(e instanceof Error ? e.message : "Periksa koneksi perangkat."); }
    })();
    return () => { alive = false; };
  }, [audience]);
  async function toggle() {
    if (lock.current) return; lock.current = true; setBusy(true);
    try {
      // Request permission directly from a user gesture (required on iOS).
      const permission = active ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Izin notifikasi belum diberikan. Anda dapat mengubahnya di pengaturan browser/HP.");
      const worker = await navigator.serviceWorker.ready;
      let sub = await worker.pushManager.getSubscription();
      if (active) {
        if (sub) { await save("unsubscribe", sub); await sub.unsubscribe(); }
        setActive(false); setMessage("Notifikasi perangkat dinonaktifkan.");
      } else {
        // A fresh endpoint avoids reusing an expired/previous-account subscription.
        if (sub) { await sub.unsubscribe(); sub = null; }
        const bytes = Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
        sub = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
        await save("subscribe", sub);
        setActive(true); setMessage(audience === "admin" ? "Notifikasi request baru aktif di PC ini." : "Notifikasi perangkat aktif. Pembaruan admin akan dikirim ke perangkat ini.");
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : "Belum berhasil. Silakan coba lagi."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="pwa-push-settings"><div><Bell size={18}/><strong>Notifikasi perangkat</strong></div><p role="status">{message || "Memeriksa perangkat…"}</p><button type="button" disabled={!ready || busy || (!key && !active)} onClick={() => void toggle()}>{busy ? <Loader2 size={16} className="pwa-submit-spinner"/> : null}{busy ? "Memproses…" : active ? "Nonaktifkan di perangkat ini" : "Aktifkan notifikasi perangkat"}</button></div>;
}
