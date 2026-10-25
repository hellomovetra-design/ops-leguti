"use client";
import { visiblePoll } from "@/lib/visible-poll";
type Listener = () => void | Promise<unknown>;
const connections = new Map<string, { listeners: Set<Listener>; stop: () => void }>();
// A shared bounded refresh replaces permanent server SSE and duplicate timers.
export function subscribeInboxRealtime(admin: boolean, listener: Listener) {
  const scope = admin ? "admin" : "user";
  let connection = connections.get(scope);
  if (!connection) {
    const listeners = new Set<Listener>();
    const stop = visiblePoll(() => Promise.allSettled([...listeners].map(callback => Promise.resolve().then(callback))), 60000);
    connection = { listeners, stop }; connections.set(scope, connection);
  }
  connection.listeners.add(listener);
  return () => {
    connection.listeners.delete(listener);
    if (!connection.listeners.size) { connection.stop(); connections.delete(scope); }
  };
}
