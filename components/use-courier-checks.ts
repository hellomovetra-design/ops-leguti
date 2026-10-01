"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CourierCheck } from "@/lib/courier-checks";
export function useCourierChecks() {
  const [items, setItems] = useState<CourierCheck[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    const ticket = ++sequence.current;
    setLoading(true);
    try {
      const records: CourierCheck[] = [];
      let more = true, offset = 0;
      while (more) {
        const response = await fetch("/api/courier-checks?offset=" + offset, { cache: "no-store", signal });
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || "Laporan belum dapat dimuat.");
        records.push(...(data.items || [])); more = data.has_more === true; offset += 200;
      }
      if (!signal?.aborted && ticket === sequence.current) { setItems(records); setError(""); }
    } catch (e) { if (!signal?.aborted && ticket === sequence.current) setError(e instanceof Error ? e.message : "Laporan belum dapat dimuat."); }
    finally { if (!signal?.aborted && ticket === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    const timer = window.setInterval(() => load(controller.signal), 60000);
    const focus = () => load(controller.signal);
    window.addEventListener("focus", focus);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [load]);
  const saved = (item: CourierCheck) => { sequence.current++; setLoading(false); setItems(current => [item, ...current.filter(x => x.id !== item.id)].sort((a,b) => +new Date(b.created_at) - +new Date(a.created_at))); setError(""); };
  return { items, error, loading, load, saved };
}
