"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={`glass-hover rounded-lg px-3 py-1.5 text-sm transition ${
        active
          ? "bg-white/70 font-medium text-accent shadow-[0_1px_2px_rgba(15,118,110,0.08)]"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </Link>
  );
}

export function PortalNav({ businessId }: { businessId: string }) {
  return (
    <nav className="glass-panel mb-6 flex gap-1 rounded-xl p-1.5">
      <NavLink href={`/portal/${businessId}`}>Dashboard</NavLink>
      <NavLink href={`/portal/${businessId}/conversations`}>Conversations</NavLink>
      <NavLink href={`/portal/${businessId}/nudges`}>Nudges</NavLink>
      <NavLink href={`/portal/${businessId}/orders`}>Orders</NavLink>
    </nav>
  );
}
