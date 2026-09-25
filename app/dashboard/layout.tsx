import { AppShell } from "@/components/app-shell";

const titles: Record<string, string> = {};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell title="Operations Dashboard">{children}</AppShell>;
}
