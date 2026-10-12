"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { shouldShowFooter } from "@/lib/site/footerVisibility";

// Renders the footer (passed in as children, so it stays a server component) only where it belongs.
export function FooterGate({ children }: { children: ReactNode }) {
  return shouldShowFooter(usePathname()) ? <>{children}</> : null;
}
