import Link from "next/link";
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
      <Link href={`/admin/businesses/${businessId}`} className="text-sm text-slate-500 hover:underline">
        ← Back
      </Link>
      <h1 className="mb-6 mt-2 text-xl font-semibold">Policies</h1>

      <PolicyList policies={policies ?? []} />

      <NewPolicyForm businessId={businessId} />
    </div>
  );
}
