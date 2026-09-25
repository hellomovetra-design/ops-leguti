import { AppShell } from "@/components/app-shell"; import { OpsDeskView } from "@/components/ops-desk-view";
export default function Page() { return <AppShell title="Problem Barang"><OpsDeskView mode="problems" /></AppShell>; }
