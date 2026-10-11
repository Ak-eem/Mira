"use client";

import { useParams } from "next/navigation";
import { RouteError } from "@/components/RouteError";

export default function PortalBusinessError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { businessId } = useParams<{ businessId: string }>();
  return <RouteError error={error} reset={reset} homeHref={`/portal/${businessId}`} homeLabel="Back to overview" scope="Portal" />;
}
