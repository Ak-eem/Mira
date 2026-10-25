"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { dashboardHref, type DashboardScope } from "@/lib/dashboardHref";

// The header's Mira logo. It lives in a layout above the [businessId] segment, so it reads the current business
// from the URL and links to that business's dashboard.
export function DashboardLink({ scope, className, children }: { scope: DashboardScope; className?: string; children: ReactNode }) {
  const params = useParams<{ businessId?: string }>();
  return (
    <Link href={dashboardHref(scope, params?.businessId)} className={className} aria-label="Mira dashboard">
      {children}
    </Link>
  );
}
