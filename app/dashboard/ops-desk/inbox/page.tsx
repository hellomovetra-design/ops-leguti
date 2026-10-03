import { AdminInbox } from "@/components/admin-inbox";
export default async function Page({ searchParams }: { searchParams: Promise<{ thread?: string }> }) {
  const params = await searchParams;
  return <AdminInbox initialThreadId={params.thread || null}/>;
}
