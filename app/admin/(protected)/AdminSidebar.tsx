"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { isRouteGroupActive } from "@/lib/adminRoutes";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/businesses", label: "Businesses" },
  { href: "/admin/analytics", label: "Mira Analytics" },
  { href: "/admin/activity", label: "Activity" },
  { href: "/admin/settings", label: "Settings" },
];

// True once the URL is inside a specific business's admin area, e.g.
// /admin/businesses/<id>/services -- but NOT for the plain list
// (/admin/businesses) or the create form (/admin/businesses/new).
// The business-scoped layout takes over the sidebar entirely at that
// point, so this component renders nothing rather than stacking a
// second, unrelated sidebar on top of it.
function isInsideSpecificBusiness(pathname: string): boolean {
  return isRouteGroupActive(pathname, "/admin/businesses") && pathname !== "/admin/businesses" && !isRouteGroupActive(pathname, "/admin/businesses/new");
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (isInsideSpecificBusiness(pathname)) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="glass-panel mb-4 rounded-lg px-3 py-2 text-sm text-slate-700 md:hidden">
        Menu
      </button>
      {open && <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="fixed inset-0 z-20 bg-slate-900/30 md:hidden" />}
      <nav className={`glass-panel fixed inset-y-0 left-0 z-30 flex w-64 flex-col gap-1 rounded-none p-4 transition-transform md:static md:z-auto md:w-52 md:rounded-xl md:p-2 ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <button type="button" onClick={() => setOpen(false)} className="mb-3 self-end text-sm text-slate-500 md:hidden">Close</button>
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : isRouteGroupActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`glass-hover rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-white/70 font-medium text-accent shadow-[0_1px_2px_rgba(15,118,110,0.08)]"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
