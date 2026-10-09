"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  ClipboardCheck,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Package,
  Settings,
  ShoppingBag,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean; badge?: number; ownerOnly?: boolean };
type Group = { label: string; items: Item[] };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "M";
}

export function PortalSidebar({
  businessId,
  businessName,
  roleLabel,
  isOwner,
  hasMultipleBusinesses,
  needsYou,
}: {
  businessId: string;
  businessName: string;
  roleLabel: string;
  isOwner: boolean;
  hasMultipleBusinesses: boolean;
  needsYou: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const base = `/portal/${businessId}`;

  const groups: Group[] = [
    {
      label: "Inbox",
      items: [
        { href: base, label: "Dashboard", icon: LayoutDashboard, exact: true },
        { href: `${base}/conversations`, label: "Conversations", icon: MessageSquare, badge: needsYou },
      ],
    },
    {
      label: "Sell",
      items: [
        { href: `${base}/orders`, label: "Orders", icon: ShoppingBag },
        { href: `${base}/inventory`, label: "Inventory assistant", icon: Package },
      ],
    },
    {
      label: "Grow",
      items: [
        { href: `${base}/nudges`, label: "Nudges", icon: Bell },
        { href: `${base}/review`, label: "Review", icon: ClipboardCheck },
        { href: `${base}/requests`, label: "Custom request", icon: Sparkles },
      ],
    },
    {
      label: "Admin",
      items: [
        { href: `${base}/team`, label: "Team", icon: Users, ownerOnly: true },
        { href: `${base}/settings`, label: "Settings", icon: Settings },
      ],
    },
  ];

  const panel = (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-soft">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-marigold text-sm font-semibold text-ink"
        >
          {initials(businessName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{businessName}</p>
          <p className="truncate text-xs text-muted">
            {roleLabel}
            {hasMultipleBusinesses && (
              <>
                {" · "}
                <Link href="/portal" className="underline-offset-2 hover:underline">
                  Switch
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      <nav aria-label="Business navigation" className="flex-1 space-y-5 overflow-y-auto">
        {groups.map((group) => {
          const items = group.items.filter((item) => !item.ownerOnly || isOwner);
          if (items.length === 0) return null;
          return (
            <div key={group.label}>
              <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-muted">{group.label}</p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                          active ? "bg-ink font-medium text-white shadow-soft" : "text-ink-2 hover:bg-mist hover:text-ink"
                        }`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${active ? "text-marigold" : "text-muted"}`} aria-hidden="true" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge ? (
                          <span className="rounded-full bg-marigold px-2 py-0.5 text-[11px] font-semibold text-ink">{item.badge}</span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </div>
  );

  return (
    <>
      <div className="mb-4 flex items-center justify-between lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink shadow-soft"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
          Menu
          {needsYou > 0 && <span className="rounded-full bg-marigold px-2 py-0.5 text-[11px] font-semibold text-ink">{needsYou}</span>}
        </button>
      </div>

      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="glass-panel-strong sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-xl p-3">{panel}</div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/40" />
          <div className="relative h-full w-72 max-w-[85vw] bg-canvas p-4 shadow-float">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-muted hover:bg-mist hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="h-full pt-8">{panel}</div>
          </div>
        </div>
      )}
    </>
  );
}
