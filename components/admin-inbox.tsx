"use client";
import { useEffect, useState } from "react";
import { InboxPanel } from "./inbox-panel";

export function AdminInbox({ initialThreadId = null }: { initialThreadId?: string | null }) {
  const [threadId, setThreadId] = useState(initialThreadId);
  useEffect(() => setThreadId(initialThreadId), [initialThreadId]);
  return <InboxPanel admin threadId={threadId} onSelect={setThreadId}/>;
}
