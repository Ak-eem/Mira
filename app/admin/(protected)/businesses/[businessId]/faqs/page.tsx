import Link from "next/link";
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
      <Link href={`/admin/businesses/${businessId}`} className="text-sm text-slate-500 hover:underline">
        ← Back
      </Link>
      <h1 className="mb-6 mt-2 text-xl font-semibold">FAQs</h1>

      <FaqList faqs={faqs ?? []} />

      <NewFaqForm businessId={businessId} />
    </div>
  );
}
