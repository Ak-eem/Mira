import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddSheet } from "@/components/ui/Sheet";
import { createClient } from "@/lib/supabase/server";
import { NewPolicyForm } from "./NewPolicyForm";
import { PolicyList } from "./PolicyList";

export default async function PoliciesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: policies } = await supabase
    .from("policies")
    .select("id, title, content")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader
        title="Policies"
        subtitle="Returns, delivery, payment and other rules Mira should follow."
        action={policies?.length ? (
          <AddSheet label="Add policy">
            <NewPolicyForm businessId={businessId} />
          </AddSheet>
        ) : undefined}
      />

      {policies?.length ? (
        <PolicyList policies={policies} />
      ) : (
        <EmptyState
          icon="list"
          title="No policies yet"
          description="Add your returns, delivery and payment rules so Mira follows them."
          action={
            <AddSheet label="Add your first policy">
              <NewPolicyForm businessId={businessId} />
            </AddSheet>
          }
        />
      )}
    </div>
  );
}
