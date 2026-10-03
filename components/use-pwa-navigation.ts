"use client";

import { useEffect, useRef } from "react";

type Entry<T> = { session: string; root: boolean; snapshot: T };
const HISTORY_KEY = "opsPwaNavigation";

/** Keep in-app screens in browser history without replacing Next's state. */
export function usePwaNavigation<T>(snapshot: T, home: T, restore: (value: T) => void, onExitHint: () => void) {
  const callbacks = useRef({ restore, onExitHint });
  callbacks.current = { restore, onExitHint };
  const session = useRef("");
  const lastSnapshot = useRef("");
  const exitAt = useRef<number | null>(null);
  const signature = JSON.stringify(snapshot);

  useEffect(() => {
    const write = (value: T, root: boolean, replace = false) => {
      const entry: Entry<T> = { session: session.current, root, snapshot: value };
      const state = { ...window.history.state, [HISTORY_KEY]: entry };
      window.history[replace ? "replaceState" : "pushState"](state, "", window.location.href);
    };

    if (!session.current) {
      session.current = crypto.randomUUID();
      // The extra home entry catches Back even when launched without history.
      write(home, true, true);
      write(snapshot, false);
      lastSnapshot.current = signature;
    } else if (lastSnapshot.current !== signature) {
      write(snapshot, false);
      lastSnapshot.current = signature;
      exitAt.current = null;
    }

    const onPopState = (event: PopStateEvent) => {
      const entry = event.state?.[HISTORY_KEY] as Entry<T> | undefined;
      if (!entry || entry.session !== session.current) return;
      if (entry.root) {
        const now = Date.now();
        if (exitAt.current !== null && now - exitAt.current < 2000) {
          // Let the browser/OS handle leaving; scripts cannot close a PWA.
          window.history.back();
          return;
        }
        exitAt.current = now;
        write(entry.snapshot, false);
        callbacks.current.onExitHint();
      } else {
        exitAt.current = null;
      }
      lastSnapshot.current = JSON.stringify(entry.snapshot);
      callbacks.current.restore(entry.snapshot);
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [signature]);
}
