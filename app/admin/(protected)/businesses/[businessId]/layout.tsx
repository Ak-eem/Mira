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

  return (
    <>
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
    </>
  );
}
