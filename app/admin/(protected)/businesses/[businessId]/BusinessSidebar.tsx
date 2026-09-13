"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { isRouteGroupActive } from "@/lib/adminRoutes";

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
      <button type="button" onClick={() => setOpen(true)} className="glass-panel fixed left-6 top-20 z-10 rounded-lg px-3 py-2 text-sm text-slate-700 md:hidden">
        Menu
      </button>
      {open && <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="fixed inset-0 z-20 bg-slate-900/30 md:hidden" />}
      <nav className={`glass-panel fixed inset-y-0 left-0 z-30 flex w-64 flex-col gap-3 rounded-none p-4 transition-transform md:static md:z-auto md:w-56 md:rounded-xl md:p-3 ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
      <button type="button" onClick={() => setOpen(false)} className="self-end text-sm text-slate-500 md:hidden">Close</button>
      <div>
        <Link href="/admin/businesses" onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:underline">
          ← All businesses
        </Link>
        <select
          value={businessId}
          onChange={(e) => { setOpen(false); router.push(`/admin/businesses/${e.target.value}`); }}
          className="mt-1.5 w-full truncate rounded-lg border border-teal-900/10 bg-white/70 px-2 py-1.5 text-sm font-medium text-slate-900"
        >
          {allBusinesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.id === businessId ? businessName : b.name}
            </option>
          ))}
        </select>
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
              className={`glass-hover rounded-lg px-3 py-1.5 text-sm transition ${
                active
                  ? "bg-white/70 font-medium text-accent shadow-[0_1px_2px_rgba(15,118,110,0.08)]"
                  : "text-slate-500 hover:text-slate-700"
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
