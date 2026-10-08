import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";

const uploadEndpoint = "https://upload.imagekit.io/api/v1/files/upload";

export function isImageKitConfigured() {
  const configured = Boolean(process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_URL_ENDPOINT);
  if (!configured && process.env.IMAGEKIT_REQUIRED === "true") throw new Error("Penyimpanan foto belum siap. Hubungi administrator.");
  return configured;
}

export async function uploadToImageKit(file: File, filePath: string) {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey) throw new Error("IMAGEKIT_PRIVATE_KEY belum dikonfigurasi.");
  const body = new URLSearchParams({
    file: Buffer.from(await file.arrayBuffer()).toString("base64"),
    fileName: filePath.substring(filePath.lastIndexOf("/") + 1) || file.name || "upload.jpg",
    folder: filePath.substring(0, filePath.lastIndexOf("/")) || "/ops-leguti",
    useUniqueFileName: "false",
    tags: "ops-leguti",
    isPrivateFile: "true",
  });
  const response = await fetch(uploadEndpoint, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${privateKey}:`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.filePath) throw new Error(result.message || "Upload ImageKit gagal.");
  return { path: result.filePath as string, fileId: result.fileId as string, url: result.url as string };
}

export async function fetchFromImageKit(filePath: string) {
  const endpoint = process.env.IMAGEKIT_URL_ENDPOINT?.replace(/\/$/, "");
  if (!endpoint) throw new Error("IMAGEKIT_URL_ENDPOINT belum dikonfigurasi.");
  const key = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!key) throw new Error("Penyimpanan foto belum siap.");
  const segments = filePath.replace(/^\//, "").split("/");
  if (segments.some(part => !part || part === "." || part === ".." || /[%?#\\]/.test(part))) throw new Error("Path foto tidak valid.");
  const relative = segments.map(encodeURIComponent).join("/");
  const expiry = Math.floor(Date.now() / 1000) + 300;
  const signature = createHmac("sha1", key).update(relative + expiry).digest("hex");
  const response = await fetch(`${endpoint}/${relative}?ik-t=${expiry}&ik-s=${signature}`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) throw new Error("Foto ImageKit tidak ditemukan.");
  return response;
}

export async function deleteFromImageKit(fileId: string) {
  const key = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!key) throw new Error("Penyimpanan foto belum siap.");
  const response = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE", headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok && response.status !== 404) throw new Error("Pembersihan foto gagal.");
}
