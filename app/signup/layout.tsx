import type { ReactNode } from "react";

// The page itself is a client component, so its tab title lives here.
export const metadata = { title: "Create your account | Mira" };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
