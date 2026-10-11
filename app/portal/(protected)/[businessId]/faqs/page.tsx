import { createClient } from "@/lib/supabase/server";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { NewFaqForm } from "@/app/admin/(protected)/businesses/[businessId]/faqs/NewFaqForm";
import { FaqList } from "@/app/admin/(protected)/businesses/[businessId]/faqs/FaqList";

export default async function FaqsPage({
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

  const { data: faqs } = await supabase
    .from("faqs")
    .select("id, question, answer")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">FAQs</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Questions customers ask often, with the answers Mira should give.</p>

      <FaqList faqs={faqs ?? []} />

      <NewFaqForm businessId={businessId} />
    </div>
  );
}
