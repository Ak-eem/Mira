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
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/site/ui";
import { SignOutButton } from "../SignOutButton";

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean; badge?: number };
type Group = { label: string; items: Item[] };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "M";
}

export function PortalSidebar({
  businessId,
  displayName,
  roleLabel,
  hasMultipleBusinesses,
  needsYou,
  email,
  planLabel,
}: {
  businessId: string;
  displayName: string;
  roleLabel: string;
  hasMultipleBusinesses: boolean;
  needsYou: number;
  email: string;
  planLabel: string;
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
        { href: `${base}/inventory`, label: "Inventory", icon: Package },
      ],
    },
    {
      label: "Grow",
      items: [
        { href: `${base}/nudges`, label: "Nudges", icon: Bell },
        { href: `${base}/review`, label: "Review", icon: ClipboardCheck },
        { href: `${base}/requests`, label: "Requests", icon: Sparkles },
      ],
    },
    {
      label: "Admin",
      items: [{ href: `${base}/settings`, label: "Settings", icon: Settings }],
    },
  ];

  const panel = (
    <div className="flex h-full min-h-0 flex-col">
      <Link href={base} aria-label="Mira for Business dashboard" className="flex shrink-0 items-center gap-2.5 px-2 pb-3">
        <Logo wordmark={false} className="shrink-0" />
        <span className="text-sm font-semibold tracking-tight text-ink">Mira <span className="font-normal text-muted">for Business</span></span>
      </Link>

      <div className="mb-3 flex shrink-0 items-center gap-3 rounded-[10px] border border-line bg-surface px-3 py-2">
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mist text-xs font-semibold text-ink">
          {initials(displayName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{displayName}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted">
            <span>{roleLabel}</span>
            {hasMultipleBusinesses && (
              <>
                <span aria-hidden="true">·</span>
                <Link href="/portal" onClick={() => setOpen(false)} className="underline-offset-2 hover:underline">
                  Switch
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      <nav aria-label="Business navigation" className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:thin]">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-0.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-[32px] items-center gap-2.5 rounded-[10px] px-3 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                        active ? "bg-ink font-semibold text-white" : "text-ink-2 hover:bg-mist hover:text-ink"
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${active ? "text-marigold" : "text-muted"}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.badge ? (
                        <span className="rounded-full bg-lime px-2 py-0.5 text-[10px] font-semibold text-marigold">{item.badge}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-2 shrink-0 border-t border-line pt-2.5">
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="inline-flex rounded-full bg-lime px-3 py-1 text-xs font-semibold text-marigold">{planLabel}</span>
          <SignOutButton />
        </div>
        <p className="mt-1.5 truncate px-1 text-[11px] text-muted" title={email}>{email}</p>
      </div>
    </div>
  );

  return (
    <>
      <div className="mb-4 flex items-center justify-between min-[900px]:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="inline-flex items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
          Menu
          {needsYou > 0 && <span className="rounded-full bg-lime px-2 py-0.5 text-[11px] font-semibold text-marigold">{needsYou}</span>}
        </button>
      </div>

      <aside className="fixed inset-y-0 left-0 z-30 hidden h-dvh w-[240px] border-r border-line bg-surface min-[900px]:block">
        <div className="h-full overflow-hidden px-3 py-4">{panel}</div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 min-[900px]:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/40" />
          <div className="relative h-full w-[280px] max-w-[85vw] border-r border-line bg-canvas px-3 py-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-muted hover:bg-mist hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
