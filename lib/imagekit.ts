import { Buffer } from "node:buffer";

const uploadEndpoint = "https://upload.imagekit.io/api/v1/files/upload";

export function isImageKitConfigured() {
  return Boolean(process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_URL_ENDPOINT);
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
  const response = await fetch(`${endpoint}/${filePath.replace(/^\//, "")}`, { cache: "no-store" });
  if (!response.ok || !response.body) throw new Error("Foto ImageKit tidak ditemukan.");
  return response;
}
