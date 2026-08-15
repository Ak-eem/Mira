import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { SettingsForm } from "./SettingsForm";
import { OwnersPanel } from "./OwnersPanel";
import { SubscriptionPanel } from "./SubscriptionPanel";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const [{ data: business }, { data: ownerRows }, { data: subscription }] = await Promise.all([
    supabase.from("businesses").select("*").eq("id", businessId).maybeSingle(),
    supabase.from("business_owners").select("id, user_id").eq("business_id", businessId),
    supabase.from("business_subscriptions").select("*").eq("business_id", businessId).maybeSingle(),
  ]);

  if (!business) notFound();

  // business_owners doesn't store email itself, and auth.users isn't
  // joinable through the regular client -- resolve each one via the
  // admin API. Fine for the handful of rows a single business will
  // realistically have; not worth a bulk lookup for this.
  const serviceRole = createServiceRoleClient();
  const owners = await Promise.all(
    (ownerRows ?? []).map(async (row) => {
      const { data } = await serviceRole.auth.admin.getUserById(row.user_id);
      return { id: row.id, email: data.user?.email ?? row.user_id };
    }),
  );

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <Link href={`/admin/businesses/${businessId}`} className="text-sm text-slate-500 hover:underline">
          ← Back
        </Link>
        <h1 className="mb-6 mt-2 text-xl font-semibold">Settings</h1>
        <SettingsForm business={business} />
      </div>

      <OwnersPanel businessId={businessId} owners={owners} />
      <SubscriptionPanel businessId={businessId} subscription={subscription} />
    </div>
  );
}
