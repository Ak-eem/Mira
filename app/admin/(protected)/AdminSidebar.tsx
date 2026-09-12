"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
  const match = pathname.match(/^\/admin\/businesses\/([^/]+)/);
  return !!match && match[1] !== "new";
}

export function AdminSidebar() {
  const pathname = usePathname();
  if (isInsideSpecificBusiness(pathname)) return null;

  return (
    <nav className="glass-panel flex w-52 shrink-0 flex-col gap-1 rounded-xl p-2">
      {NAV_ITEMS.map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
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
  );
}
