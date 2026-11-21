"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, Building2, Inbox, LayoutDashboard, Settings, type LucideIcon } from "lucide-react";
import { isRouteGroupActive } from "@/lib/adminRoutes";
import { AdminRail } from "./AdminRail";

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

export function AdminSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  if (isInsideSpecificBusiness(pathname)) return null;

  return (
    <AdminRail email={email}>
      {(close) => (
        <nav aria-label="Admin navigation" className="space-y-1.5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-0.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{group.label}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = item.href === "/admin" ? pathname === "/admin" : isRouteGroupActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={close}
                        aria-current={active ? "page" : undefined}
                        className={`flex min-h-[32px] items-center gap-2.5 rounded-[10px] px-3 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                          active ? "bg-ink font-semibold text-white" : "text-ink-2 hover:bg-mist hover:text-ink"
                        }`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${active ? "text-marigold" : "text-muted"}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      )}
    </AdminRail>
  );
}
