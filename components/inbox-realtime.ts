"use client";

type Listener = () => void;
const connections = new Map<string, { listeners: Set<Listener>; stop: () => void }>();

// Share one stream between the badge and open conversation in this browser tab.
export function subscribeInboxRealtime(admin: boolean, listener: Listener) {
  const scope = admin ? "admin" : "user";
  let connection = connections.get(scope);
  if (!connection) {
    const listeners = new Set<Listener>();
    let source: EventSource | null = null;
    let pending: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
      clearTimeout(pending);
      pending = setTimeout(() => listeners.forEach(callback => callback()), 100);
    };
    const resume = () => {
      if (document.visibilityState !== "visible") { source?.close(); source = null; return; }
      if (!source) {
        source = new EventSource(`/api/inbox/events?scope=${scope}`);
        source.addEventListener("change", changed);
      }
    };
    document.addEventListener("visibilitychange", resume);
    resume();
    connection = { listeners, stop: () => {
      source?.close(); clearTimeout(pending);
      document.removeEventListener("visibilitychange", resume);
    } };
    connections.set(scope, connection);
  }
  connection.listeners.add(listener);
  return () => {
    connection.listeners.delete(listener);
    if (!connection.listeners.size) { connection.stop(); connections.delete(scope); }
  };
}
