import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CommandCenter } from "./CommandCenter";

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
      <Link href={`/admin/businesses/${businessId}`} className="text-sm text-slate-500 hover:underline">
        ← Back
      </Link>
      <h1 className="mb-1 mt-2 text-xl font-semibold">Command Center</h1>
      <p className="mb-6 text-sm text-slate-500">
        Tell Mira what to change for {business.name}. Nothing writes to your data without you confirming it first.
      </p>
      <CommandCenter businessId={businessId} />
    </div>
  );
}
