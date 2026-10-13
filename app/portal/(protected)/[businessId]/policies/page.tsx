import { createClient } from "@/lib/supabase/server";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { NewPolicyForm } from "@/app/admin/(protected)/businesses/[businessId]/policies/NewPolicyForm";
import { PolicyList } from "@/app/admin/(protected)/businesses/[businessId]/policies/PolicyList";

export default async function PoliciesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const owner = await getCurrentBusinessOwner();
  if (owner?.businesses.find((b) => b.id === businessId)?.role !== "owner") {
    return <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">Only the business owner can edit this.</p>;
  }
  const supabase = await createClient();

  const { data: policies } = await supabase
    .from("policies")
    .select("id, title, content")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Policies</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Returns, delivery, payment and other rules Mira should follow.</p>

      <PolicyList policies={policies ?? []} />

      <NewPolicyForm businessId={businessId} />
    </div>
  );
}
