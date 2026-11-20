"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";
import { isRouteGroupActive } from "@/lib/adminRoutes";
import GlideSelect from "@/components/ui/GlideSelect";

type BusinessOption = { id: string; name: string };

const NAV_ITEMS = [
  { segment: "", label: "Overview" },
  { segment: "conversations", label: "Chat" },
  { segment: "analytics", label: "Business Analytics" },
  { segment: "services", label: "Services" },
  { segment: "products", label: "Products" },
  { segment: "faqs", label: "FAQs" },
  { segment: "policies", label: "Policies" },
  { segment: "hours", label: "Opening Hours" },
  { segment: "promotions", label: "Promotions" },
  { segment: "closures", label: "Closures" },
  { segment: "command", label: "Command Center" },
  { segment: "activity", label: "Activity" },
  { segment: "settings", label: "Settings" },
];

export function BusinessSidebar({
  businessId,
  businessName,
  allBusinesses,
}: {
  businessId: string;
  businessName: string;
  allBusinesses: BusinessOption[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const base = `/admin/businesses/${businessId}`;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="glass-panel-strong mb-4 inline-flex min-h-10 items-center gap-2 self-start rounded-xl px-3 py-2 text-sm text-slate-700 md:hidden">
        <Menu className="h-4 w-4" aria-hidden="true" />
        Menu
      </button>
      {open && <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="fixed inset-0 z-20 bg-slate-900/30 md:hidden" />}
      <nav className={`glass-panel-strong !border-0 shadow-[0_1px_2px_rgba(15,42,34,0.06),0_12px_28px_-18px_rgba(15,42,34,0.35)] fixed inset-y-0 left-0 z-30 flex w-64 flex-col gap-3 overflow-y-auto rounded-none p-4 transition-transform md:static md:z-auto md:w-56 md:rounded-2xl md:p-3 ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <button type="button" onClick={() => setOpen(false)} className="self-end text-sm text-slate-500 md:hidden">Close</button>
        <div>
          <Link href="/admin/businesses" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:underline">
            ← All businesses
          </Link>
          <div className="mt-1.5">
            <GlideSelect
              fullWidth
              ariaLabel="Switch business"
              value={businessId}
              options={allBusinesses.map((b) => ({ value: b.id, label: b.id === businessId ? businessName : b.name }))}
              onChange={(id) => { setOpen(false); router.push(`/admin/businesses/${id}`); }}
              size="md"
              radius={12}
              menuWidth={0}
              surfaceColor="var(--color-surface)"
              highlightColor="var(--color-mist)"
              textColor="var(--color-ink)"
              accentColor="var(--color-marigold)"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const href = item.segment ? `${base}/${item.segment}` : base;
            const active = isRouteGroupActive(pathname, href);
            return (
              <Link
                key={item.segment || "overview"}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center rounded-xl px-3 py-2 text-[15px] transition-colors duration-200 ${
                  active ? "bg-ink font-semibold text-white shadow-soft" : "text-ink-2 hover:bg-slate-900/5 hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
