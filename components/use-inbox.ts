"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { InboxMessage, InboxThread } from "@/lib/inbox";
import { DEMO_ADMIN, DEMO_USER, InboxDemo, initialInboxDemo } from "@/lib/inbox-demo";

const DEMO_KEY = "ops-inbox-local-preview-v1";
const DEMO_EVENT = "ops-inbox-demo-change";
export const DEMO_NOTICE_EVENT = "ops-inbox-preview-notice";
export type InboxDemoNotice = { threadId: string; audience: "admin" | "user"; title: string; body: string };
function demoNotice(notice: InboxDemoNotice) { window.dispatchEvent(new CustomEvent(DEMO_NOTICE_EVENT, { detail: notice })); }
function readDemo(): InboxDemo {
  try { const saved = localStorage.getItem(DEMO_KEY); if (saved) return JSON.parse(saved); } catch { /* preview can run without storage */ }
  return initialInboxDemo();
}
function saveDemo(data: InboxDemo) {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify(data)); } catch { /* keep UI available */ }
  window.dispatchEvent(new CustomEvent(DEMO_EVENT, { detail: data }));
}

export function createInboxDemoRequest(subject: string, summary: string) {
  const data = readDemo(), id = crypto.randomUUID(), created_at = new Date().toISOString();
  const seq = Math.max(0, ...data.messages.map(item => item.seq)) + 1;
  data.threads.unshift({ id, entity_id: id, entity_type: "request", owner_email: DEMO_USER.email, owner_name: DEMO_USER.name, subject, reference: "TGRANDI01", summary, status: "pending", created_at, last_message_at: created_at, last_body: "Request baru dikirim", first_admin_email: null, first_admin_name: null, unread: 0 });
  data.messages.push({ id: crypto.randomUUID(), seq, thread_id: id, sender_email: DEMO_USER.email, sender_name: DEMO_USER.name, sender_role: "user", kind: "request", body: summary, created_at });
  saveDemo(data); demoNotice({ threadId: id, audience: "admin", title: "Request baru dari Andi Pratama", body: subject }); return id;
}
export function resetInboxDemo() { saveDemo(initialInboxDemo()); }

export function useInbox({ admin = false, demo = false, threadId = null }: { admin?: boolean; demo?: boolean; threadId?: string | null }) {
  const [threads, setThreads] = useState<InboxThread[]>([]), [messages, setMessages] = useState<InboxMessage[]>([]);
  const [thread, setThread] = useState<InboxThread | null>(null), [email, setEmail] = useState("");
  const [unread, setUnread] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false), [moreMessages, setMoreMessages] = useState(false), [sending, setSending] = useState(false);
  const sequence = useRef(0), sendLock = useRef(false), demoData = useRef<InboxDemo | null>(null);
  const requestId = useRef<{ id: string; thread: string; text: string } | null>(null);
  const scope = admin ? "admin" : "user";

  const applyDemo = useCallback((data: InboxDemo) => {
    demoData.current = data;
    const actor = admin ? DEMO_ADMIN : DEMO_USER;
    const visible = data.threads.filter(item => admin || item.owner_email === actor.email).map(item => ({ ...item, unread: data.messages.filter(message => message.thread_id === item.id && message.sender_email !== actor.email && message.seq > (data.reads[`${actor.email}:${item.id}`] || 0)).length })).sort((a, b) => +new Date(b.last_message_at) - +new Date(a.last_message_at));
    setThreads(visible); setUnread(visible.reduce((sum, item) => sum + item.unread, 0)); setEmail(actor.email);
    setThread(visible.find(item => item.id === threadId) || null);
    setMessages(threadId ? data.messages.filter(item => item.thread_id === threadId).sort((a, b) => a.seq - b.seq) : []);
    setLoading(false); setError("");
  }, [admin, threadId]);

  const refresh = useCallback(async () => {
    if (demo) { applyDemo(demoData.current || readDemo()); return; }
    const ticket = ++sequence.current;
    try {
      const response = await fetch(`/api/inbox?scope=${scope}${threadId ? `&thread_id=${encodeURIComponent(threadId)}` : ""}`, { cache: "no-store" });
      const data = await response.json();
      if (ticket !== sequence.current) return;
      if (!response.ok) throw new Error(data.error || "Inbox belum dapat dimuat.");
      setEmail(data.email); setThreads(current => [...(data.items || []), ...current.filter(item => !(data.items || []).some((fresh: InboxThread) => fresh.id === item.id))]); setUnread(data.unread || 0); setHasMore(!!data.has_more);
      if (threadId) {
        setThread(data.thread); setMessages(current => {
          const fresh: InboxMessage[] = data.messages || [];
          return [...current.filter(item => item.thread_id === threadId && !fresh.some(next => next.id === item.id)), ...fresh].sort((a, b) => a.seq - b.seq);
        });
        setMoreMessages(!!data.more_messages);
      }
      setError("");
    } catch (e) { if (ticket === sequence.current) setError(e instanceof Error ? e.message : "Periksa koneksi Anda."); }
    finally { if (ticket === sequence.current) setLoading(false); }
  }, [demo, applyDemo, scope, threadId]);

  useEffect(() => {
    setThread(null); setMessages([]); setLoading(true); setError("");
    if (demo) {
      applyDemo(readDemo());
      const changed = (event: Event) => applyDemo((event as CustomEvent<InboxDemo>).detail || readDemo());
      window.addEventListener(DEMO_EVENT, changed); window.addEventListener("storage", changed);
      return () => { window.removeEventListener(DEMO_EVENT, changed); window.removeEventListener("storage", changed); };
    }
    void refresh();
    const resume = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(resume, 20000);
    window.addEventListener("focus", resume); document.addEventListener("visibilitychange", resume);
    return () => { sequence.current++; clearInterval(timer); window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", resume); };
  }, [demo, applyDemo, refresh]);

  const markRead = useCallback(async (seq: number) => {
    if (!threadId) return false;
    if (demo) {
      const data = readDemo(), actor = admin ? DEMO_ADMIN : DEMO_USER;
      const key = `${actor.email}:${threadId}`;
      if ((data.reads[key] || 0) >= seq) return true;
      data.reads[key] = seq; saveDemo(data); return true;
    }
    try {
      const response = await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read", scope, thread_id: threadId, seq }) });
      if (!response.ok) return false;
      setUnread(current => Math.max(0, current - (threads.find(item => item.id === threadId)?.unread || 0)));
      setThreads(current => current.map(item => item.id === threadId ? { ...item, unread: 0 } : item));
      window.dispatchEvent(new Event("ops-inbox-read"));
      return true;
    } catch { return false; }
  }, [threadId, demo, admin, scope, threads]);

  async function send(body: string) {
    if (sendLock.current || !threadId || !body.trim()) return false;
    sendLock.current = true; setSending(true); setError("");
    try {
      if (demo) {
        const data = readDemo(), actor = admin ? DEMO_ADMIN : DEMO_USER;
        const message: InboxMessage = { id: crypto.randomUUID(), seq: Math.max(0, ...data.messages.map(item => item.seq)) + 1, thread_id: threadId, sender_email: actor.email, sender_name: actor.name, sender_role: admin ? "admin" : "user", kind: "message", body: body.trim(), created_at: new Date().toISOString() };
        data.messages.push(message);
        data.threads = data.threads.map(item => item.id === threadId ? { ...item, last_body: message.body, last_message_at: message.created_at, ...(admin && !item.first_admin_email ? { first_admin_email: actor.email, first_admin_name: actor.name } : {}) } : item);
        saveDemo(data);
        if (admin) demoNotice({ threadId, audience: "user", title: `${actor.name} membalas request kamu`, body: message.body });
      } else {
        if (!requestId.current || requestId.current.thread !== threadId || requestId.current.text !== body.trim()) requestId.current = { id: crypto.randomUUID(), thread: threadId, text: body.trim() };
        const response = await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", scope, thread_id: threadId, body: body.trim(), client_id: requestId.current.id }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Pesan belum terkirim. Silakan coba lagi.");
        requestId.current = null; await refresh();
      }
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Pesan belum terkirim."); return false; }
    finally { sendLock.current = false; setSending(false); }
  }

  async function loadMore(olderMessages = false) {
    if (demo) return;
    const ticket = sequence.current;
    try {
      const query = olderMessages ? `&thread_id=${threadId}&before=${messages[0]?.seq || 0}` : `&offset=${threads.length}`;
      const response = await fetch(`/api/inbox?scope=${scope}${query}`, { cache: "no-store" });
      const data = await response.json();
      if (ticket !== sequence.current) return;
      if (!response.ok) throw new Error(data.error || "Riwayat belum dapat dimuat.");
      if (olderMessages) { setMessages(current => [...(data.messages || []).filter((item: InboxMessage) => !current.some(row => row.id === item.id)), ...current]); setMoreMessages(!!data.more_messages); }
      else { setThreads(current => [...current, ...(data.items || []).filter((item: InboxThread) => !current.some(row => row.id === item.id))]); setHasMore(!!data.has_more); }
    } catch (e) { setError(e instanceof Error ? e.message : "Riwayat belum dapat dimuat."); }
  }
  return { threads, thread, messages, email, unread, loading, error, hasMore, moreMessages, sending, send, refresh, markRead, loadMore };
}
