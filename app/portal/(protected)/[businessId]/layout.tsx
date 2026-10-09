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
    <div className="w-full px-4 py-6 sm:px-6 lg:flex lg:gap-6 lg:px-8 lg:py-8">
      <PortalSidebar
        businessId={businessId}
        businessName={business.name}
        roleLabel={isOwner ? "Owner" : "Team member"}
        isOwner={isOwner}
        hasMultipleBusinesses={owner.businesses.length > 1}
        needsYou={needsYou ?? 0}
        email={user.email ?? ""}
        planLabel={`${trialing ? "Free trial · " : ""}${subscriptionLabel(access.subscription)}`}
        showUpgrade={isOwner && trialing}
      />
      <div className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  );
}
