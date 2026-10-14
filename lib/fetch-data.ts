// Bound data reads so an unresponsive API cannot leave the UI loading forever.
export async function fetchData(url: string, signal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 15000);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || "Data belum dapat dimuat.");
    return data;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error("Koneksi lambat. Data akan dicoba kembali otomatis.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
