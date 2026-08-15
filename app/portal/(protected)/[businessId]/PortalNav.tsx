"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={`border-b-2 px-1 pb-3 text-sm transition ${
        active
          ? "border-accent font-medium text-accent"
          : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
      }`}
    >
      {children}
    </Link>
  );
}

export function PortalNav({ businessId }: { businessId: string }) {
  return (
    <nav className="mb-6 flex gap-6 border-b border-slate-200">
      <NavLink href={`/portal/${businessId}`}>Dashboard</NavLink>
      <NavLink href={`/portal/${businessId}/conversations`}>Conversations</NavLink>
      <NavLink href={`/portal/${businessId}/nudges`}>Nudges</NavLink>
      <NavLink href={`/portal/${businessId}/orders`}>Orders</NavLink>
    </nav>
  );
}
