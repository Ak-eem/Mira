import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { getBusinessEntitlement } from "@/lib/billing";
import { subscriptionLabel } from "@/lib/plans";
import { PortalNav } from "./PortalNav";

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

  return (
    <div>
      <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        <span>{access.subscription?.status === "trialing" ? "Free trial" : "Subscription"}</span>
        <span className="font-medium">{subscriptionLabel(access.subscription)}</span>
      </div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{business.name}</h1>
        {owner.businesses.length > 1 && <Link href="/portal" className="text-sm text-slate-400 hover:text-slate-600">Switch business</Link>}
      </div>
      <PortalNav businessId={businessId} />
      {children}
    </div>
  );
}
