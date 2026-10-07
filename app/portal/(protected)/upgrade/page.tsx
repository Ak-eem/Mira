import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getBusinessEntitlement } from "@/lib/billing";
import { isPaidPeriodEnded } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import SubscribeButton from "@/app/components/SubscribeButton";

export default async function PortalUpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ businessId?: string }>;
}) {
  const { businessId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/portal/login");
  if (!businessId) redirect("/inbox");

  const { data: ownerMembership } = await supabase
    .from("business_owners")
    .select("business_id")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (!ownerMembership) redirect("/inbox");

  const owner = await getCurrentBusinessOwner();
  if (!owner) redirect("/portal/login");
  const business = owner.businesses.find((item) => item.id === businessId);
  if (!business) redirect("/inbox");
  const access = await getBusinessEntitlement(business.id);

  const status = access.subscription?.status;
  const paidPeriodEnded = isPaidPeriodEnded(access.subscription);

  const copy =
    status === "cancelled"
      ? {
          title: "Your subscription is cancelled",
          body: "Mira is switched off. It no longer answers on your website, WhatsApp or email, and the chat widget has been removed from your site. Your data is kept for 30 days in case you change your mind.",
          hint: "Subscribe again to turn Mira back on. Your widget will reappear on your site automatically.",
        }
      : paidPeriodEnded
        ? {
            title: "Your subscription has ended",
            body: "Mira is paused. The chat widget is hidden from your site and it is not answering on WhatsApp or email. Messages your customers send while it is paused are not answered or replayed later. Nothing is deleted.",
            hint: "Subscribe again and everything resumes automatically as soon as your payment is confirmed.",
          }
        : {
            title: "Your trial has ended",
            body: "Choose a paid plan to continue managing your business and replying to customers.",
            hint: "Subscribe to turn Mira on. Everything resumes automatically as soon as your payment is confirmed.",
          };

  return (
    <main className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xs">
      <p className="text-sm font-medium text-accent">{business.name}</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">{copy.title}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{copy.body}</p>
      <div className="mt-6 rounded-lg bg-slate-50 p-4 text-left text-sm text-slate-600">{copy.hint}</div>
      <div className="mt-4">
        <Suspense fallback={null}>
          <SubscribeButton plan="base" businessName={business.name} email={user.email ?? ""} />
        </Suspense>
      </div>
      <Link href="/portal" className="mt-6 inline-flex rounded-sm border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Back to businesses</Link>
    </main>
  );
}
