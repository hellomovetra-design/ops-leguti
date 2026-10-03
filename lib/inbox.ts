export type InboxThread = {
  id: string;
  entity_type: "request" | "problem";
  entity_id: string;
  owner_email: string;
  owner_name: string;
  subject: string;
  reference: string;
  summary: string;
  status: string;
  created_at: string;
  last_message_at: string;
  last_body: string;
  first_admin_email: string | null;
  first_admin_name: string | null;
  unread: number;
};

export type InboxMessage = {
  client_id?: string | null;
  pending?: boolean;
  id: string;
  seq: number;
  thread_id: string;
  sender_email: string;
  sender_name: string;
  sender_role: "user" | "admin";
  kind: "request" | "message";
  body: string;
  created_at: string;
};

export const INBOX_ADMIN_ROLES = ["super_admin", "admin"];
export const inboxStatus = (status: string) =>
  ({ pending: "Menunggu admin", open: "Menunggu admin", approved: "Dikonfirmasi", sent: "Diproses", verified: "Dikonfirmasi", in_progress: "Diproses", completed: "Selesai", resolved: "Selesai", closed: "Selesai", rejected: "Ditolak" }[status] || status);
export const inboxDone = (status: string) => ["completed", "resolved", "closed"].includes(status);
export const inboxThreadStatus = (thread: Pick<InboxThread, "status" | "first_admin_email">) =>
  thread.first_admin_email && ["pending", "open"].includes(thread.status) ? "Menunggu proses" : inboxStatus(thread.status);
export const inboxInitials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
export const inboxTime = (date: string) => new Date(date).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });

export function canAccessInbox(thread: Pick<InboxThread, "owner_email">, email: string, role: string, adminMode: boolean) {
  return adminMode ? INBOX_ADMIN_ROLES.includes(role) : thread.owner_email === email.trim().toLowerCase();
}
