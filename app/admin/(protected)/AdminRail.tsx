"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/site/ui";
import { createClient } from "@/lib/supabase/client";

function initials(email: string): string {
  const parts = (email.split("@")[0] ?? "").split(/[._+-]/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "A";
}

// The admin's left rail, the same shape as the business portal's: logo, who is signed in, the
// navigation (passed in), then sign-out. Nothing inside it carries a border; only the rail's own edge does.
export function AdminRail({
  email,
  children,
}: {
  email: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  const panel = (
    <div className="flex h-full min-h-0 flex-col">
      <Link href="/admin" onClick={close} aria-label="Mira Admin dashboard" className="flex shrink-0 items-center gap-2.5 px-2 pb-3">
        <Logo wordmark={false} className="shrink-0" />
        <span className="text-sm font-semibold tracking-tight text-ink">Mira <span className="font-normal text-muted">Admin</span></span>
      </Link>

      <div className="mb-3 flex shrink-0 items-center gap-3 rounded-[10px] bg-mist px-3 py-2">
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-ink">
          {initials(email)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink" title={email}>{email}</p>
          <p className="text-[11px] text-muted">Platform admin</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:thin]">{children(close)}</div>

      <div className="mt-2 flex shrink-0 items-center justify-between gap-2 px-1 pt-2">
        <span className="inline-flex rounded-full bg-lime px-3 py-1 text-xs font-semibold text-marigold">Admin</span>
        <button type="button" onClick={signOut} className="text-sm text-muted transition hover:text-ink">Sign out</button>
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
          className="inline-flex items-center gap-2 rounded-[10px] bg-mist px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
          Menu
        </button>
      </div>

      <aside className="fixed inset-y-0 left-0 z-30 hidden h-dvh w-[240px] border-r border-line bg-surface min-[900px]:block">
        <div className="h-full overflow-hidden px-3 py-4">{panel}</div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 min-[900px]:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" onClick={close} className="absolute inset-0 bg-ink/40" />
          <div className="relative h-full w-[280px] max-w-[85vw] bg-canvas px-3 py-4">
            <button
              type="button"
              onClick={close}
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
