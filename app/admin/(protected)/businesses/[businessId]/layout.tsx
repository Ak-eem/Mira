import { redirect } from "next/navigation";
import { getBusinessEntitlement } from "@/lib/billing";
import { subscriptionLabel } from "@/lib/plans";

export default async function AdminBusinessLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const access = await getBusinessEntitlement(businessId);
  if (!access.entitled) redirect(`/admin/upgrade?businessId=${encodeURIComponent(businessId)}`);

  return (
    <>
      <div className="mb-5 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        <span>{access.subscription?.status === "trialing" ? "Free trial" : "Subscription"}</span>
        <span className="font-medium">{subscriptionLabel(access.subscription)}</span>
      </div>
      {children}
    </>
  );
}
