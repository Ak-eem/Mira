"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { isRouteGroupActive } from "@/lib/adminRoutes";
import { AdminRail } from "../../AdminRail";
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
  email,
}: {
  businessId: string;
  businessName: string;
  allBusinesses: BusinessOption[];
  email: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/admin/businesses/${businessId}`;

  return (
    <AdminRail email={email}>
      {(close) => (
        <div className="space-y-3">
          <div>
            <Link href="/admin/businesses" onClick={close} className="text-xs text-muted hover:text-ink hover:underline">
              ← All businesses
            </Link>
            <div className="mt-1.5">
              <GlideSelect
                fullWidth
                ariaLabel="Switch business"
                value={businessId}
                options={allBusinesses.map((b) => ({ value: b.id, label: b.id === businessId ? businessName : b.name }))}
                onChange={(id) => { close(); router.push(`/admin/businesses/${id}`); }}
                size="md"
                radius={12}
                menuWidth={0}
                surfaceColor="var(--color-mist)"
                highlightColor="var(--color-surface)"
                textColor="var(--color-ink)"
                accentColor="var(--color-marigold)"
                borderColor="transparent"
              />
            </div>
          </div>

          <nav aria-label="Business navigation" className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const href = item.segment ? `${base}/${item.segment}` : base;
              const active = isRouteGroupActive(pathname, href);
              return (
                <Link
                  key={item.segment || "overview"}
                  href={href}
                  onClick={close}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-[32px] items-center rounded-[10px] px-3 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    active ? "bg-ink font-semibold text-white" : "text-ink-2 hover:bg-mist hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </AdminRail>
  );
}
