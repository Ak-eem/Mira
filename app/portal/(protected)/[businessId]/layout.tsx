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
  const emailName = user.email.split("@")[0]?.split(/[._+-]/)[0]?.replace(/\d+$/, "") ?? "";
  const displayName = emailName ? `${emailName[0].toLocaleUpperCase()}${emailName.slice(1)}` : "there";

  return (
    <div className="portal-business-layout min-w-0">
      <PortalSidebar
        businessId={businessId}
        displayName={displayName}
        roleLabel={isOwner ? "Owner" : "Team member"}
        hasMultipleBusinesses={owner.businesses.length > 1}
        needsYou={needsYou ?? 0}
        email={user.email}
        planLabel={subscriptionLabel(access.subscription)}
      />
      <div className="min-w-0">
        {children}
      </div>
    </div>
  );
}
