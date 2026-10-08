"use client";
import { useEffect, useState } from "react";
import { OpsDeskView } from "./ops-desk-view";
import { BarkurPanel } from "./barkur-panel";
import "./barkur-panel.css";
export function OtsMonitoring() {
  const [tab, setTab] = useState<"ots" | "barkur">("barkur");
  useEffect(() => { if (new URLSearchParams(window.location.search).get("tab") === "ots") setTab("ots"); }, []);
  return <><nav className="barkur-tabs" aria-label="Monitoring OTS"><button type="button" aria-pressed={tab === "barkur"} onClick={() => setTab("barkur")}>Rekap BARKUR</button><button type="button" aria-pressed={tab === "ots"} onClick={() => setTab("ots")}>Monitoring OTS</button></nav>{tab === "barkur" ? <BarkurPanel/> : <OpsDeskView mode="ots"/>}</>;
}
