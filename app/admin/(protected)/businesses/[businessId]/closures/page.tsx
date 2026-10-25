import { createClient } from "@/lib/supabase/server";
import { NewClosureForm } from "./NewClosureForm";
import { ClosureList } from "./ClosureList";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function ClosuresPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("timezone")
    .eq("id", businessId)
    .maybeSingle();
  const businessTimezone = business?.timezone ?? "Africa/Lagos";

  const { data: closures } = await supabase
    .from("closures")
    .select("id, starts_at, ends_at, reason")
    .eq("business_id", businessId)
    .order("starts_at", { ascending: false });

  return (
    <div>
      <PageHeader title="Closures" />

      <ClosureList closures={closures ?? []} businessTimezone={businessTimezone} />

      <NewClosureForm businessId={businessId} />
    </div>
  );
}
