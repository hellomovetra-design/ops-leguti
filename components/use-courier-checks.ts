"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CourierCheck } from "@/lib/courier-checks";
import { visiblePoll } from "@/lib/visible-poll";
export function useCourierChecks(scope?: "mine", enabled = true) {
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
        const response = await fetch("/api/courier-checks?offset=" + offset + (scope === "mine" ? "&scope=mine" : ""), { cache: "no-store", signal });
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || "Laporan belum dapat dimuat.");
        records.push(...(data.items || [])); more = data.has_more === true; offset += 200;
      }
      if (!signal?.aborted && ticket === sequence.current) { setItems(records); setError(""); }
    } catch (e) { if (!signal?.aborted && ticket === sequence.current) setError(e instanceof Error ? e.message : "Laporan belum dapat dimuat."); }
    finally { if (!signal?.aborted && ticket === sequence.current) setLoading(false); }
  }, [scope]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const stop = visiblePoll(() => load(controller.signal));
    return () => { stop(); controller.abort(); };
  }, [load, enabled]);
  const saved = (item: CourierCheck) => { sequence.current++; setLoading(false); setItems(current => [item, ...current.filter(x => x.id !== item.id)].sort((a,b) => +new Date(b.created_at) - +new Date(a.created_at))); setError(""); };
  return { items, error, loading, load, saved };
}
