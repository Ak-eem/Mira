import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .maybeSingle();

  if (!business) notFound();

  return (
    <div className="max-w-lg">
      <Link href={`/admin/businesses/${businessId}`} className="text-sm text-slate-500 hover:underline">
        ← Back
      </Link>
      <h1 className="mb-6 mt-2 text-xl font-semibold">Settings</h1>
      <SettingsForm business={business} />
    </div>
  );
}
