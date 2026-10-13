"use client";

import { RouteError } from "@/components/RouteError";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} homeHref="/admin" homeLabel="Back to dashboard" scope="Admin" />;
}
