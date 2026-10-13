import { notFound, redirect } from "next/navigation";
import { getRequestClient, getRequestUser } from "@/lib/supabase/request";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { getBusinessEntitlement } from "@/lib/billing";
import { subscriptionLabel } from "@/lib/plans";
import { PortalSidebar } from "./PortalSidebar";

export default async function PortalBusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const user = await getRequestUser();
  if (!user) redirect(`/portal/login?next=${encodeURIComponent(`/portal/${businessId}`)}`);

  // Membership, entitlement and the inbox badge don't depend on each other, so they
  // run together (one round-trip of waiting instead of three). RLS still scopes the
  // two business-specific reads to what this user may see.
  const supabase = await getRequestClient();
  const [owner, access, { count: needsYou }] = await Promise.all([
    getCurrentBusinessOwner(),
    getBusinessEntitlement(businessId),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("needs_human", true),
  ]);
  if (!owner) redirect("/portal");
  const business = owner.businesses.find((item) => item.id === businessId);
  if (!business) notFound();
  if (!access.entitled) redirect(`/portal/upgrade?businessId=${encodeURIComponent(businessId)}`);

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
        email={user.email}
        planLabel={`${trialing ? "Free trial · " : ""}${subscriptionLabel(access.subscription)}`}
        showUpgrade={isOwner && trialing}
      />
      <div className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  );
}
