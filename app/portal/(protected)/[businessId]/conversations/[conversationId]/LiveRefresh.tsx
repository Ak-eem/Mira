"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-fetches this server-rendered page on an interval so an operator
// watching a conversation sees new customer messages (and handoff state
// changes) without manually reloading. Deliberately simple: this page has
// no local client state to merge against, unlike the customer widget, so
// router.refresh() re-running the server component is enough -- no need
// to duplicate the polling-and-merge logic built for ChatWindow.tsx.
export function LiveRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [router, intervalMs]);

  return null;
}
