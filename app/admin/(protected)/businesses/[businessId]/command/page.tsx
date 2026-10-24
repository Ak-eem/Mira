import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CommandCenter } from "./CommandCenter";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function CommandPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .maybeSingle();

  if (!business) notFound();

  return (
    <div>
      <PageHeader title="Command Center" subtitle={<>Tell Mira what to change for {business.name}. Nothing writes to your data without you confirming it first.</>} />
      <CommandCenter businessId={businessId} />
    </div>
  );
}
