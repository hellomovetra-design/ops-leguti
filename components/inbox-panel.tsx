"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, CheckCheck, ChevronRight, Headphones, Inbox, Loader2, MessageCircle, Package, Search, Send, ShieldCheck } from "lucide-react";
import { InboxThread, inboxDone, inboxInitials, inboxThreadStatus, inboxTime } from "@/lib/inbox";
import { useInbox } from "./use-inbox";
import { PwaPushSettings } from "./pwa-push-settings";
import "./inbox.css";

type Props = { admin?: boolean; demo?: boolean; threadId: string | null; onSelect: (id: string | null) => void };
export function InboxPanel({ admin = false, demo = false, threadId, onSelect }: Props) {
  const model = useInbox({ admin, demo, threadId });
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("all"), [drafts, setDrafts] = useState<Record<string, string>>({});
  const bottom = useRef<HTMLDivElement>(null), seen = useRef(""), reading = useRef(false);
  const draft = threadId ? drafts[threadId] || "" : "";
  const threads = model.threads.filter(item => `${item.owner_name} ${item.subject} ${item.reference} ${item.first_admin_name || ""}`.toLowerCase().includes(query.toLowerCase()) && (filter === "unread" ? item.unread > 0 : filter === "waiting" ? !item.first_admin_email && !inboxDone(item.status) : filter === "done" ? inboxDone(item.status) : true));
  const last = model.messages.at(-1);
  useEffect(() => {
    if (!last || !threadId) return;
    const mark = () => {
      if (document.visibilityState !== "visible") return;
      const key = `${threadId}:${last.seq}`;
      if (seen.current === key || reading.current) return;
      reading.current = true;
      void model.markRead(last.seq).then(ok => { if (ok) seen.current = key; }).finally(() => { reading.current = false; });
    };
    mark(); document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [last?.seq, threadId, model.markRead]);
  useEffect(() => { if (last || model.pendingMessage) bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [last?.id, model.pendingMessage?.id, threadId]);

  const updateDraft = (value: string) => { if (threadId) setDrafts(current => ({ ...current, [threadId]: value })); };
  async function submit() {
    if (!threadId || model.sending || !draft.trim()) return;
    const id = threadId, text = draft;
    if (await model.send(text)) setDrafts(current => ({ ...current, [id]: current[id] === text ? "" : current[id] }));
  }
  const openThread = model.thread;
  const person = openThread ? admin ? openThread.owner_name : openThread.first_admin_name || "Tim Admin LEGUTI" : "";

  return <section className={`inbox-module ${admin ? "inbox-admin" : "inbox-mobile"}${threadId ? " has-conversation" : ""}`}>
    <aside className="inbox-sidebar">
      <div className="inbox-heading"><div><span className="inbox-eyebrow">KOMUNIKASI OPERASIONAL</span><h1>Inbox<span className="inbox-heading-count">{model.unread}</span></h1><p>{admin ? "Request masuk, respons lebih mudah." : "Konfirmasi request langsung dengan admin."}</p></div><span className="inbox-heading-icon"><MessageCircle size={24}/></span></div>
      <label className="inbox-search"><Search size={17}/><input aria-label="Cari percakapan" value={query} onChange={event => setQuery(event.target.value)} placeholder={admin ? "Cari nama, request, atau AWB" : "Cari request atau nomor AWB"}/></label>
      <div className="inbox-filters" aria-label="Filter percakapan">{[["all", "Semua"], ["unread", "Belum dibaca"], ["waiting", "Menunggu"], ["done", "Selesai"]].map(([value, label]) => <button key={value} aria-pressed={filter === value} className={filter === value ? "selected" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div>
      <div className="inbox-thread-list">
        {model.loading && !model.threads.length ? <div className="inbox-empty"><Loader2 className="inbox-spinner"/><p>Memuat percakapan…</p></div> : !threads.length && !model.error ? <div className="inbox-empty"><Inbox size={38}/><strong>{query || filter !== "all" ? "Tidak ada percakapan yang cocok" : "Belum ada percakapan"}</strong><p>{admin ? "Request baru akan otomatis muncul di sini." : "Kirim request atau laporan problem untuk mulai berbicara dengan admin."}</p></div> : null}
        {threads.map(item => <ThreadRow key={item.id} thread={item} admin={admin} selected={item.id === threadId} onClick={() => onSelect(item.id)}/>)}
        {model.hasMore && <button className="inbox-load-more" onClick={() => void model.loadMore()}>Percakapan sebelumnya</button>}
      </div>
      <div className="inbox-sidebar-note"><ShieldCheck size={15}/><span>{admin ? "Setiap balasan memakai nama akun admin." : "Percakapan khusus untuk request milikmu."}</span></div>
    </aside>

    <div className="inbox-conversation">
      {!threadId ? <div className="inbox-welcome"><div className="inbox-welcome-art"><MessageCircle size={48}/><span><CheckCheck size={21}/></span></div><span className="inbox-eyebrow">SATU REQUEST, SATU PERCAKAPAN</span><h2>Mulai dari request yang masuk.</h2><p>Pilih percakapan untuk melihat detail request,<br/>memprosesnya, dan memberi konfirmasi kepada user.</p><div className="inbox-welcome-steps"><span>Request masuk</span><ChevronRight size={15}/><span>Proses</span><ChevronRight size={15}/><span>Balas</span></div>{admin && !demo && <PwaPushSettings audience="admin"/>}</div> : openThread ? <>
        <header className="inbox-chat-header"><button className="inbox-back" aria-label="Kembali ke daftar Inbox" onClick={() => onSelect(null)}><ArrowLeft size={21}/></button><span className={`inbox-avatar ${admin ? "" : "is-admin"}`}>{admin ? inboxInitials(person) : <Headphones size={22}/>}</span><div className="inbox-chat-person"><strong>{person}</strong><small>{admin ? "Pengirim request · " + openThread.subject : openThread.first_admin_name ? "Admin penanggap request kamu" : "Menunggu admin pertama membalas"}</small></div><span className={`inbox-status ${inboxDone(openThread.status) ? "done" : ""}`}>{inboxThreadStatus(openThread)}</span></header>
        <div className="inbox-chat-context"><ShieldCheck size={15}/><span>Terhubung ke request · <strong>{openThread.reference || openThread.subject}</strong></span></div>
        <div className="inbox-messages" aria-label="Riwayat percakapan">
          {model.moreMessages && <button className="inbox-load-more" onClick={() => void model.loadMore(true)}>Pesan sebelumnya</button>}
          <div className="inbox-date">{new Date(openThread.created_at).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" })}</div>
          <div className="inbox-request-event"><span className="inbox-event-dot"/><span>{openThread.owner_name} mengirim {openThread.entity_type === "problem" ? "laporan problem" : "request"}</span></div>
          <article className="inbox-request-card"><div className="inbox-request-top"><span className={`inbox-request-icon ${openThread.entity_type}`}>{openThread.entity_type === "problem" ? <Package size={23}/> : <Headphones size={23}/>}</span><div><small>{openThread.entity_type === "problem" ? "LAPORAN BARANG" : "REQUEST HELPDESK"}</small><h3>{openThread.subject}</h3></div><span className={`inbox-status ${inboxDone(openThread.status) ? "done" : ""}`}>{inboxThreadStatus(openThread)}</span></div><div className="inbox-request-reference"><span>{openThread.entity_type === "problem" ? "Nomor AWB" : "Referensi"}</span><strong>{openThread.reference || "—"}</strong></div><p>{openThread.summary}</p><footer><span><CheckCheck size={14}/>Request berhasil dikirim · {inboxTime(openThread.created_at)}</span>{admin && !demo && <a href={`/dashboard/ops-desk/${openThread.entity_type === "problem" ? "problems" : "requests"}?id=${encodeURIComponent(openThread.entity_id)}`}>Proses request<ArrowUpRight size={14}/></a>}</footer></article>
          {!openThread.first_admin_email && <div className="inbox-awaiting"><span/><p>{admin ? "Belum ada admin yang membalas. Balasan pertamamu akan menampilkan namamu di PWA user." : "Request sudah diterima. Nama admin akan muncul setelah ada balasan."}</p></div>}
          {[...model.messages, ...(model.pendingMessage ? [model.pendingMessage] : [])].filter(item => item.kind !== "request").map(message => {
            const mine = message.sender_email === model.email;
            return <div className={`inbox-message ${mine ? "mine" : "theirs"}`} key={message.id}><div className="inbox-message-author">{message.sender_name}{message.sender_role === "admin" && <span>Admin</span>}</div><div className="inbox-bubble"><p>{message.body}</p><span>{inboxTime(message.created_at)}{mine && (message.pending ? <span role="status">Mengirim…</span> : <CheckCheck size={14} aria-label="Terkirim"/>)}</span></div></div>;
          })}
          <div ref={bottom}/>
        </div>
        {model.error && <div className="inbox-error" role="alert">{model.error}<button onClick={() => void model.refresh()}>Coba lagi</button></div>}
        <div className="inbox-compose"><div className="inbox-quick-replies">{(admin ? ["Oke bro, tunggu ya.", "Sedang saya proses.", "Sudah selesai, silakan dicek."] : ["Siap, terima kasih.", "Baik, saya tunggu."]).map(text => <button key={text} disabled={model.sending} onClick={() => updateDraft(text)}>{text}</button>)}</div><form onSubmit={event => { event.preventDefault(); void submit(); }}><textarea aria-label="Tulis pesan" value={draft} maxLength={2000} rows={1} placeholder={admin ? "Tulis konfirmasi untuk user…" : "Tulis pesan untuk admin…"} disabled={model.sending} onChange={event => updateDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }}/><button type="submit" aria-label="Kirim pesan" disabled={model.sending || !draft.trim()}>{model.sending ? <Loader2 className="inbox-spinner" size={19}/> : <Send size={19}/>}</button></form><small>{admin ? "Dikirim dengan nama akun admin yang sedang login" : "Percakapan dapat dilihat admin yang berwenang"}</small></div>
      </> : <div className="inbox-empty">{model.loading ? <><Loader2 className="inbox-spinner"/><p>Memuat percakapan…</p></> : <><Inbox size={36}/><strong>Percakapan belum dapat dibuka</strong><p>{model.error || "Pilih request lain atau muat ulang Inbox."}</p><button onClick={() => onSelect(null)}>Kembali ke Inbox</button></>}</div>}
    </div>
    {model.error && !threadId && <div className="inbox-error" role="alert">{model.error}<button onClick={() => void model.refresh()}>Coba lagi</button></div>}
  </section>;
}

function ThreadRow({ thread, admin, selected, onClick }: { thread: InboxThread; admin: boolean; selected: boolean; onClick: () => void }) {
  const person = admin ? thread.owner_name : thread.first_admin_name || "Tim Admin LEGUTI";
  return <button className={`inbox-thread${selected ? " active" : ""}${thread.unread ? " unread" : ""}`} onClick={onClick}><span className={`inbox-avatar ${admin ? "" : "is-admin"}`}>{admin ? inboxInitials(person) : <Headphones size={21}/>}</span><span className="inbox-thread-copy"><span className="inbox-thread-line"><strong>{person}</strong><time>{inboxTime(thread.last_message_at)}</time></span><span className="inbox-thread-subject">{thread.entity_type === "problem" ? <Package size={12}/> : <Headphones size={12}/>} {thread.subject}</span><span className="inbox-thread-preview">{thread.last_body}</span><span className="inbox-thread-meta"><span className={`inbox-status ${inboxDone(thread.status) ? "done" : ""}`}>{inboxThreadStatus(thread)}</span><small>{thread.reference}</small></span></span>{thread.unread > 0 && <span className="inbox-unread">{thread.unread > 99 ? "99+" : thread.unread}</span>}</button>;
}
