import type { SessionPayload } from "@/lib/auth-token";

/** PWA always requests personal history; viewers cannot opt into global history. */
export function personalHistory(session: SessionPayload, params: URLSearchParams) {
  return session.role === "viewer" || params.get("scope") === "mine";
}

export function scopeHistory<T extends { eq: (column: string, value: string) => T }>(query: T, session: SessionPayload, params: URLSearchParams, column = "created_by"): T {
  return personalHistory(session, params) ? query.eq(column, session.email.trim().toLowerCase()) : query;
}
