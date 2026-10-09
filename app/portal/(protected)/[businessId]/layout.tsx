import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { getBusinessEntitlement } from "@/lib/billing";
import { subscriptionLabel } from "@/lib/plans";
import { PortalSidebar } from "./PortalSidebar";

export default async function PortalBusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/portal/login?next=${encodeURIComponent(`/portal/${businessId}`)}`);

  const owner = await getCurrentBusinessOwner();
  if (!owner) redirect("/portal");
  const business = owner.businesses.find((item) => item.id === businessId);
  if (!business) notFound();

  const access = await getBusinessEntitlement(businessId);
  if (!access.entitled) redirect(`/portal/upgrade?businessId=${encodeURIComponent(businessId)}`);

  const { count: needsYou } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("needs_human", true);

  const isOwner = business.role === "owner";
  const trialing = access.subscription?.status === "trialing";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:flex lg:gap-8">
      <PortalSidebar
        businessId={businessId}
        businessName={business.name}
        roleLabel={isOwner ? "Owner" : "Team member"}
        isOwner={isOwner}
        hasMultipleBusinesses={owner.businesses.length > 1}
        needsYou={needsYou ?? 0}
      />
      <div className="min-w-0 flex-1">
        <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-marigold/40 bg-lime px-4 py-2.5 text-sm text-ink">
          <span>{trialing ? "Free trial" : "Subscription"}</span>
          <span className="flex items-center gap-3">
            <span className="font-medium">{subscriptionLabel(access.subscription)}</span>
            {isOwner && trialing && (
              <Link
                href={`/portal/upgrade?businessId=${encodeURIComponent(businessId)}`}
                className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-white transition hover:bg-ink-2"
              >
                Upgrade
              </Link>
            )}
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
