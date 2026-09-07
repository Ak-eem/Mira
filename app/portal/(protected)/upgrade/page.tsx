import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { getBusinessEntitlement } from "@/lib/billing";

export default async function PortalUpgradePage({ searchParams }: { searchParams: Promise<{ businessId?: string }> }) {
  const { businessId } = await searchParams;
  const owner = await getCurrentBusinessOwner();
  if (!owner) redirect("/portal/login");
  const business = owner.businesses.find((item) => item.id === businessId) ?? owner.businesses[0];
  if (!business) redirect("/portal");
  const access = await getBusinessEntitlement(business.id);
  return (
    <main className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="text-sm font-medium text-accent">{business.name}</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Your trial has ended</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">Choose a paid plan to continue managing your business and replying to customers.</p>
      <div className="mt-6 rounded-lg bg-slate-50 p-4 text-left text-sm text-slate-600"><strong>Current status:</strong> {access.subscription?.status ?? "inactive"}</div>
      <p className="mt-4 text-xs text-slate-500">Payment integration is not connected yet. Please contact the Mira administrator to activate your plan.</p>
      <Link href="/portal" className="mt-6 inline-flex rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Back to businesses</Link>
    </main>
  );
}
