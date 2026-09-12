"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type BusinessOption = { id: string; name: string };

const NAV_ITEMS = [
  { segment: "", label: "Overview" },
  { segment: "conversations", label: "Chat" },
  { segment: "analytics", label: "Business Analytics" },
  { segment: "services", label: "Services" },
  { segment: "faqs", label: "FAQs" },
  { segment: "policies", label: "Policies" },
  { segment: "hours", label: "Opening Hours" },
  { segment: "promotions", label: "Promotions" },
  { segment: "closures", label: "Closures" },
  { segment: "command", label: "Command Center" },
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
  const base = `/admin/businesses/${businessId}`;

  return (
    <nav className="glass-panel flex w-56 shrink-0 flex-col gap-3 rounded-xl p-3">
      <div>
        <Link href="/admin/businesses" className="text-xs text-slate-400 hover:underline">
          ← All businesses
        </Link>
        <select
          value={businessId}
          onChange={(e) => router.push(`/admin/businesses/${e.target.value}`)}
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
          const active = item.segment ? pathname.startsWith(href) : pathname === base;
          return (
            <Link
              key={item.segment || "overview"}
              href={href}
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
  );
}
