// Scheduled work stops in hidden/offline tabs and cannot overlap itself.
export function visiblePoll(work: () => void | Promise<unknown>, interval = 300000) {
  let stopped = false, busy = false, last = -Infinity;
  const run = async () => {
    if (stopped || busy || document.visibilityState !== "visible" || navigator.onLine === false || Date.now() - last < 1000) return;
    busy = true; last = Date.now();
    try { await work(); } catch { /* Caller owns error presentation. */ }
    finally { busy = false; }
  };
  const resume = () => { if (Date.now() - last >= Math.min(interval, 30000)) void run(); };
  void run();
  const timer = window.setInterval(() => void run(), interval);
  window.addEventListener("focus", resume); window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
  return () => { stopped = true; clearInterval(timer); window.removeEventListener("focus", resume); window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
}
