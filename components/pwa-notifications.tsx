"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, ChevronRight, Headphones, Loader2, Package, RefreshCw, Trash2 } from "lucide-react";
import { PwaPushSettings } from "./pwa-push-settings";

type Notice = { id: string; title: string; body: string; entity_type: string; created_at: string; read_at: string | null };
export function usePwaNotifications() {
  const [items, setItems] = useState<Notice[]>([]), [unread, setUnread] = useState(0), [error, setError] = useState(""), [loading, setLoading] = useState(true), [more, setMore] = useState(false), [busy, setBusy] = useState(false);
  const sequence = useRef(0), lock = useRef(false);
  const refresh = useCallback(async () => {
    const ticket = ++sequence.current;
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const data = await response.json();
      if (ticket !== sequence.current) return;
      if (!response.ok) { if (response.status === 401) { setItems([]); setUnread(0); } throw new Error(data.error || "Notifikasi belum dapat dimuat."); }
      // Replace the current page so notices deleted in another tab/device cannot
      // be resurrected by merging stale local history into the server response.
      setItems(data.items || []); setUnread(data.unread || 0); setMore(!!data.has_more); setError("");
    } catch (e) { if (ticket === sequence.current) setError(e instanceof Error ? e.message : "Periksa koneksi Anda."); }
    finally { if (ticket === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const resume = () => { if (document.visibilityState === "visible" && !lock.current) void refresh(); };
    const timer = window.setInterval(resume, 15000);
    window.addEventListener("focus", resume); document.addEventListener("visibilitychange", resume);
    return () => { sequence.current++; clearInterval(timer); window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", resume); };
  }, [refresh]);
  async function markRead(id?: string) {
    const response = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read", ...(id ? { id } : {}) }) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Status dibaca belum dapat disimpan.");
    sequence.current++;
    const ids = new Set<string>(data.ids || []);
    setItems(current => current.map(item => ids.has(item.id) ? { ...item, read_at: new Date().toISOString() } : item));
    setUnread(current => Math.max(0, current - ids.size));
  }
  async function action(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Silakan coba lagi."); }
    finally { lock.current = false; setBusy(false); }
  }
  const readAll = () => action(async () => { await markRead(); await refresh(); });
  const remove = (notice: Notice) => {
    if (!window.confirm("Hapus notifikasi ini secara permanen? Request dan percakapan tidak ikut dihapus.")) return;
    return action(async () => {
      sequence.current++; // Ignore list requests started before this deletion.
      const response = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id: notice.id }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Notifikasi belum dapat dihapus.");
      sequence.current++;
      setItems(current => current.filter(item => item.id !== notice.id));
      if (!notice.read_at) setUnread(current => Math.max(0, current - 1));
      await refresh();
    });
  };
  const loadMore = () => action(async () => {
    const response = await fetch(`/api/notifications?offset=${items.length}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Notifikasi belum dapat dimuat.");
    setItems(current => [...current, ...(data.items || []).filter((item: Notice) => !current.some(x => x.id === item.id))]);
    setMore(!!data.has_more); setUnread(data.unread || 0);
  });
  const open = (notice: Notice, onOpen: (item: any) => void) => action(async () => {
    const response = await fetch(`/api/notifications?notification_id=${encodeURIComponent(notice.id)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.item) throw new Error(data.error || "Detail laporan belum dapat dimuat.");
    if (!notice.read_at) await markRead(notice.id);
    onOpen(data.item);
  });
  return { items, unread, error, loading, busy, more, refresh, readAll, loadMore, open, remove };
}

export function PwaNotifications({ model, onOpen }: { model: ReturnType<typeof usePwaNotifications>; onOpen: (item: any) => void }) {
  return <section className="pwa-notification-page">
    <div className="pwa-notification-heading"><div><h2>Notifikasi</h2><p>Riwayat tetap tersimpan sampai Anda hapus.</p></div><button aria-label="Muat ulang notifikasi" disabled={model.busy || model.loading} onClick={() => void model.refresh()}><RefreshCw size={18}/></button></div>
    <PwaPushSettings/>
    {model.unread > 0 && <button className="pwa-read-all" disabled={model.busy} onClick={() => void model.readAll()}><CheckCheck size={16}/>Tandai semua dibaca</button>}
    {model.error && <p className="pwa-notification-error" role="alert">{model.error}</p>}
    {model.loading ? <div className="pwa-notification-empty" role="status"><Loader2 className="pwa-submit-spinner"/><span>Memuat notifikasi…</span></div> : !model.items.length && !model.error ? <div className="pwa-notification-empty"><Bell/><strong>Belum ada notifikasi</strong><span>Pembaruan dari admin akan muncul di sini.</span></div> : null}
    <div className="pwa-notification-list">{model.items.map(item => <div key={item.id} className="pwa-notification-entry"><button className={"pwa-notification-row" + (!item.read_at ? " unread" : "")} disabled={model.busy} onClick={() => void model.open(item, onOpen)} aria-label={`${item.read_at ? "" : "Belum dibaca: "}${item.title}`}>
      <span className={"pwa-notification-icon " + item.entity_type}>{item.entity_type === "problem" ? <Package size={20}/> : <Headphones size={20}/>}</span><span className="pwa-notification-copy"><strong>{item.title}</strong><span>{item.body}</span><small>{new Date(item.created_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} WIB</small></span>{!item.read_at && <span className="pwa-unread-dot" aria-hidden="true"/>}<ChevronRight size={16}/>
    </button><button className="pwa-notification-delete" aria-label={`Hapus notifikasi: ${item.title}`} disabled={model.busy || model.loading} onClick={() => void model.remove(item)}><Trash2 size={16}/><span>Hapus</span></button></div>)}</div>
    {model.more && <button className="pwa-read-all" disabled={model.busy} onClick={() => void model.loadMore()}>{model.busy ? "Memuat…" : "Notifikasi sebelumnya"}</button>}
  </section>;
}
