export const SESSION_COOKIE = "jne_session";
export const SESSION_MAX_AGE = 60 * 60 * 8;

export type SessionPayload = {
  email: string;
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

export async function createSessionToken(email: string, role: SessionPayload["role"], secret: string) {
  const payload: SessionPayload = {
    email,
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
    if (!payload.email || !["super_admin", "admin", "spv", "jr_spv", "coordinator", "viewer"].includes(payload.role) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
