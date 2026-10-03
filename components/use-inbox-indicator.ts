"use client";
import { useEffect, useState } from "react";

export function useInboxIndicator(admin = false) {
  const [unread, setUnread] = useState(0), [available, setAvailable] = useState(false);
  useEffect(() => {
    let alive = true, busy = false;
    const refresh = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const response = await fetch(`/api/inbox?scope=${admin ? "admin" : "user"}&summary=1`, { cache: "no-store" });
        const data = await response.json();
        if (alive) { setAvailable(response.ok); setUnread(response.ok ? data.unread || 0 : 0); }
      } catch { if (alive) setAvailable(false); }
      finally { busy = false; }
    };
    void refresh(); const timer = window.setInterval(refresh, 20000);
    window.addEventListener("focus", refresh); window.addEventListener("ops-inbox-read", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("ops-inbox-read", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [admin]);
  return { unread, available };
}
