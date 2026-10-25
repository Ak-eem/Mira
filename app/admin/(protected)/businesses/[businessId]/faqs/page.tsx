import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddSheet } from "@/components/ui/Sheet";
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
      <PageHeader
        title="FAQs"
        subtitle="Questions customers ask often, with the answers Mira should give."
        action={faqs?.length ? (
          <AddSheet label="Add FAQ">
            <NewFaqForm businessId={businessId} />
          </AddSheet>
        ) : undefined}
      />

      {faqs?.length ? (
        <FaqList faqs={faqs} />
      ) : (
        <EmptyState
          icon="chat"
          title="No faqs yet"
          description="Write the questions customers ask most, with the exact answer you want Mira to give."
          action={
            <AddSheet label="Add your first FAQ">
              <NewFaqForm businessId={businessId} />
            </AddSheet>
          }
        />
      )}
    </div>
  );
}
