// Process one photo at a time to limit peak memory on mobile devices.
export async function prepareCourierPhoto(file: File): Promise<File> {
  if (!file.size || file.size > 25 * 1024 * 1024) throw new Error("Ukuran foto harus di antara 1 byte dan 25 MB.");
  if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) throw new Error("Pilih foto JPG, PNG, atau WebP.");
  const url = URL.createObjectURL(file);
  let bitmap: ImageBitmap | undefined;
  const canvas = document.createElement("canvas");
  try {
    let source: CanvasImageSource;
    let width: number, height: number;
    try {
      if (typeof createImageBitmap !== "function") throw new Error("fallback");
      bitmap = await createImageBitmap(file, { resizeWidth: 1600, resizeQuality: "medium", imageOrientation: "from-image" });
      source = bitmap; width = bitmap.width; height = bitmap.height;
    } catch {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Foto tidak dapat dibaca di HP ini. Pilih JPG/PNG dari galeri atau ambil ulang foto dengan kamera."));
        img.src = url;
      });
      source = img; width = img.naturalWidth; height = img.naturalHeight;
    }
    if (!width || !height) throw new Error("Foto kosong atau rusak. Pilih foto lain.");
    const scale = Math.min(1, 1600 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Memori HP belum cukup untuk memproses foto. Tutup aplikasi lain lalu coba lagi.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.66, 0.5, 0.35]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= 900 * 1024) return new File([blob], (file.name.replace(/\.[^.]+$/, "") || "foto") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
    }
    throw new Error("Foto masih terlalu besar. Pilih foto dengan resolusi lebih kecil.");
  } finally {
    bitmap?.close();
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
  }
}
