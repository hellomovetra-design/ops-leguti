export const SESSION_COOKIE = "jne_session";
// Persistent cookie survives app/browser restarts; page visits renew it daily.
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

export type SessionPayload = {
  email: string;
  employee_nik?: string;
  role: "super_admin" | "admin" | "spv" | "jr_spv" | "coordinator" | "viewer";
  exp: number;
};

const encoder = new TextEncoder();

export function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function createSessionToken(email: string, role: SessionPayload["role"], secret: string, employeeNik?: string) {
  const payload: SessionPayload = {
    email,
    ...(employeeNik ? { employee_nik: employeeNik } : {}),
    role,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const encodedPayload = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = encodeBase64Url(await hmac(encodedPayload, secret));
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(token: string | undefined, secret: string | undefined) {
  if (!token || !secret || secret.length < 32) return null;
  try {
    const [payloadPart, signaturePart, extra] = token.split(".");
    if (!payloadPart || !signaturePart || extra) return null;
    const expected = await hmac(payloadPart, secret);
    const received = decodeBase64Url(signaturePart);
    if (!constantTimeEqual(expected, received)) return null;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadPart))) as SessionPayload;
    if (typeof payload.email !== "string" || !payload.email || !["super_admin", "admin", "spv", "jr_spv", "coordinator", "viewer"].includes(payload.role) || !Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    // Never authorize a long-lived session using its old role snapshot.
    // Read the access record on every server request so promotions AND demotions apply.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const endpoint = new URL("/rest/v1/ops_users", url);
      endpoint.searchParams.set("select", "role");
      endpoint.searchParams.set("email", `eq.${payload.email.trim().toLowerCase()}`);
      endpoint.searchParams.set("limit", "2");
      const response = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) return null;
      const records = await response.json();
      if (!Array.isArray(records) || records.length > 1) return null;
      const primary = (process.env.INTERNAL_SUPER_ADMIN_EMAIL || "ibadnarpatih@gmail.com").trim().toLowerCase();
      const role = payload.email.toLowerCase() === primary ? "super_admin" : records[0]?.role;
      if (!["super_admin", "admin", "spv", "jr_spv", "coordinator", "viewer"].includes(role)) return null;
      return { ...payload, role } as SessionPayload;
    }
    if (process.env.NODE_ENV === "production") return null;
    return payload;
  } catch {
    return null;
  }
}
