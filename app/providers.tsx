"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition } from "react";
import { ReportRow } from "@/lib/types";

type AppContextValue = {
  reports: ReportRow[];
  allReports: ReportRow[];
  startDate: string;
  setStartDate: (val: string) => void;
  endDate: string;
  setEndDate: (val: string) => void;
  addReports: (rows: ReportRow[]) => void;
  replaceReports: (rows: ReportRow[]) => void;
  refreshReports: () => Promise<void>;
  toast: (message: string) => void;
  isPending: boolean;
};

const AppContext = createContext<AppContextValue | null>(null);

export function Providers({ children }: { children: React.ReactNode }) {
  const [allReports, setAllReports] = useState<ReportRow[]>([]);
  const [startDate, setStartDate] = useState("2026-06-27");
  const [endDate, setEndDate] = useState("2026-07-05");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const refreshReports = useCallback(async () => {
    setAllReports([]);
  }, []);

  useEffect(() => {
    startTransition(async () => {
      await refreshReports();
    });
  }, [refreshReports]);

  useEffect(() => {
    if (message) {
      const timer = window.setTimeout(() => setMessage(""), 2600);
      return () => window.clearTimeout(timer);
    }
  }, [message]);

  const persist = useCallback((rows: ReportRow[]) => {
    setAllReports(rows);
    try {
      localStorage.setItem("jne-ops-reports", JSON.stringify(rows));
    } catch { /* ignore limit */ }
  }, []);

  const addReports = useCallback((rows: ReportRow[]) => {
    persist(rows);
  }, [allReports, persist, refreshReports]);

  // Compute filtered reports based on date range selection
  const reports = useMemo(() => {
    return allReports.filter((r) => {
      if (!r.reportDate) return true;
      return r.reportDate >= startDate && r.reportDate <= endDate;
    });
  }, [allReports, startDate, endDate]);

  const value = useMemo(() => ({
    reports,
    allReports,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    addReports,
    replaceReports: persist,
    refreshReports,
    toast: setMessage,
    isPending
  }), [reports, allReports, startDate, endDate, addReports, persist, refreshReports, isPending]);

  return (
    <AppContext.Provider value={value}>
      {children}
      {message && <div className="toast" role="status">✓ {message}</div>}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within Providers");
  return context;
}
