import { createClient } from "@/lib/supabase/server";
import { NewFaqForm } from "./NewFaqForm";
import { FaqList } from "./FaqList";

export default async function FaqsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: faqs } = await supabase
    .from("faqs")
    .select("id, question, answer")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="mb-6 mt-2 text-xl font-semibold">FAQs</h1>

      <FaqList faqs={faqs ?? []} />

      <NewFaqForm businessId={businessId} />
    </div>
  );
}
