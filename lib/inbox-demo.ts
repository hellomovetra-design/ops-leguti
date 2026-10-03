import { InboxMessage, InboxThread } from "./inbox";

export const DEMO_USER = { email: "andi@example.test", name: "Andi Pratama" };
export const DEMO_ADMIN = { email: "budi@example.test", name: "Budi Santoso" };
export type InboxDemo = { threads: InboxThread[]; messages: InboxMessage[]; reads: Record<string, number> };
const stamp = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();

export function initialInboxDemo(): InboxDemo {
  const make = (id: string, subject: string, reference: string, summary: string, minutes: number, status = "pending", owner = DEMO_USER, problem = false): InboxThread => ({
    id, entity_id: id, entity_type: problem ? "problem" : "request", owner_email: owner.email, owner_name: owner.name,
    subject, reference, summary, status, created_at: stamp(minutes), last_message_at: stamp(minutes),
    last_body: "Request baru dikirim", first_admin_email: null, first_admin_name: null, unread: 0,
  });
  const threads = [
    make("demo-activation", "Aktivasi User TGR", "TGRANDI01", "User TGR saya terkunci. Mohon bantu aktivasi agar bisa melanjutkan operasional.", 12),
    make("demo-problem", "Barang Problem", "JNE0123456789", "Alamat penerima kurang lengkap. Mohon konfirmasi langkah penanganannya.", 48, "in_progress", DEMO_USER, true),
    make("demo-cl3", "Open Status CL3", "JNE0987654321", "Paket sudah berada di destinasi, mohon bantu open status CL3.", 135, "completed", { email: "rina@example.test", name: "Rina Amelia" }),
  ];
  const messages: InboxMessage[] = threads.map((thread, i) => ({ id: `demo-card-${i}`, seq: i + 1, thread_id: thread.id, sender_email: thread.owner_email, sender_name: thread.owner_name, sender_role: "user", kind: "request", body: thread.summary, created_at: thread.created_at }));
  threads[1] = { ...threads[1], first_admin_email: DEMO_ADMIN.email, first_admin_name: DEMO_ADMIN.name, last_body: "Oke bro, tunggu ya. Saya cek dulu alamat penerimanya.", last_message_at: stamp(5) };
  messages.push({ id: "demo-reply", seq: 4, thread_id: threads[1].id, sender_email: DEMO_ADMIN.email, sender_name: DEMO_ADMIN.name, sender_role: "admin", kind: "message", body: threads[1].last_body, created_at: stamp(5) });
  threads[2] = { ...threads[2], first_admin_email: DEMO_ADMIN.email, first_admin_name: DEMO_ADMIN.name, last_body: "Sudah selesai ya, silakan dicek kembali.", last_message_at: stamp(60) };
  messages.push({ id: "demo-completed", seq: 5, thread_id: threads[2].id, sender_email: DEMO_ADMIN.email, sender_name: DEMO_ADMIN.name, sender_role: "admin", kind: "message", body: threads[2].last_body, created_at: stamp(60) });
  return { threads, messages, reads: {} };
}
