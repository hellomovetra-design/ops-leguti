import { notFound } from "next/navigation";
import { InboxPreview } from "@/components/inbox-preview";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <InboxPreview/>;
}
