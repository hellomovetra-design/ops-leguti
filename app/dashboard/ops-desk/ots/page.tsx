import { AppShell } from "@/components/app-shell"; import { OpsDeskView } from "@/components/ops-desk-view";
export default function Page() { return <AppShell title="Monitoring OTS"><OpsDeskView mode="ots" /></AppShell>; }
