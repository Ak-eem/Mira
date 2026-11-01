"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Activity, BarChart3, Building2, Inbox, LayoutDashboard, Menu, Settings, type LucideIcon } from "lucide-react";
import { isRouteGroupActive } from "@/lib/adminRoutes";

type NavItem = { href: string; label: string; icon: LucideIcon };
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/analytics", label: "Mira Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Customers",
    items: [
      { href: "/admin/businesses", label: "Businesses", icon: Building2 },
      { href: "/admin/activity", label: "Activity", icon: Activity },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/queue", label: "Message queue", icon: Inbox },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
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
      <button type="button" onClick={() => setOpen(true)} className="glass-panel-strong mb-4 inline-flex min-h-10 items-center gap-2 self-start rounded-xl px-3 py-2 text-sm text-slate-700 md:hidden">
        <Menu className="h-4 w-4" aria-hidden="true" />
        Menu
      </button>
      {open && <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="fixed inset-0 z-20 bg-slate-900/30 md:hidden" />}
      <nav className={`glass-panel-strong fixed inset-y-0 left-0 z-30 flex w-64 flex-col gap-1 rounded-none p-4 transition-transform overflow-y-auto md:static md:z-auto md:w-56 md:shrink-0 md:self-start md:rounded-2xl md:p-3 ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <button type="button" onClick={() => setOpen(false)} className="mb-3 self-end text-sm text-slate-500 md:hidden">Close</button>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-2">
            <p className="ui-section-label !mb-1 !ml-3">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.href === "/admin" ? pathname === "/admin" : isRouteGroupActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors duration-200 ${
                        active ? "bg-ink font-semibold text-white shadow-soft" : "text-ink-2 hover:bg-slate-900/5 hover:text-ink"
                      }`}
                    >
                      <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-marigold" : "text-muted"}`} aria-hidden="true" />
                      <span className="flex-1 truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
