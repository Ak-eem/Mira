import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBusinessEntitlement } from "@/lib/billing";
import { subscriptionLabel } from "@/lib/plans";
import { BusinessSidebar } from "./BusinessSidebar";

export default async function AdminBusinessLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const [access, { data: business }, { data: allBusinesses }] = await Promise.all([
    getBusinessEntitlement(businessId),
    supabase.from("businesses").select("name").eq("id", businessId).maybeSingle(),
    supabase.from("businesses").select("id, name").order("name"),
  ]);

  if (!business) notFound();

  return (
    <div className="flex gap-6">
      <BusinessSidebar
        businessId={businessId}
        businessName={business.name}
        allBusinesses={allBusinesses ?? [{ id: businessId, name: business.name }]}
      />
      <div className="min-w-0 flex-1">
        <div
          className={`mb-5 flex items-center justify-between rounded-lg border px-4 py-2 text-sm ${
            access.entitled
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          <span>
            {access.entitled
              ? access.subscription?.status === "trialing"
                ? "Free trial"
                : "Subscription"
              : "Locked for this business's owner"}
          </span>
          <span className="font-medium">{subscriptionLabel(access.subscription)}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
