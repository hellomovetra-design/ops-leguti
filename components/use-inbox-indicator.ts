"use client";
import { useEffect, useState } from "react";
import { subscribeInboxRealtime } from "./inbox-realtime";

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
    void refresh();
    const unsubscribe = subscribeInboxRealtime(admin, refresh);
    window.addEventListener("ops-inbox-read", refresh);
    return () => { unsubscribe(); alive = false; window.removeEventListener("ops-inbox-read", refresh); };
  }, [admin]);
  return { unread, available };
}
