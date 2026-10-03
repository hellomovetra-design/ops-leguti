import { RequestHelpdeskPanel } from "@/components/request-helpdesk-panel";
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) { const params = await searchParams; return <RequestHelpdeskPanel initialId={params.id || ""}/>; }
