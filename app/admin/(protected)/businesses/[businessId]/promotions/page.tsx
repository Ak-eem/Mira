import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewPromotionForm } from "./NewPromotionForm";
import { PromotionList } from "./PromotionList";

export default async function PromotionsPage({
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

  const { data: promotions } = await supabase
    .from("promotions")
    .select("id, description, service_id, starts_at, ends_at, is_active")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  const { data: services } = await supabase
    .from("services")
    .select("id, name")
    .eq("business_id", businessId);

  return (
    <div>
      <Link href={`/admin/businesses/${businessId}`} className="text-sm text-slate-500 hover:underline">
        ← Back
      </Link>
      <h1 className="mb-6 mt-2 text-xl font-semibold">Promotions</h1>

      <PromotionList promotions={promotions ?? []} services={services ?? []} businessTimezone={businessTimezone} />

      <NewPromotionForm businessId={businessId} services={services ?? []} />
    </div>
  );
}
