"use client";

import { RouteError } from "@/components/RouteError";

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} homeHref="/portal" homeLabel="Back to my businesses" scope="Portal" />;
}
