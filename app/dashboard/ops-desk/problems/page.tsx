import { ProblemGoodsPanel } from "@/components/problem-goods-panel";
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) { const params = await searchParams; return <ProblemGoodsPanel initialId={params.id || ""}/>; }
