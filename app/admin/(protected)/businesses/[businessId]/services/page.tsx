import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewServiceForm } from "./NewServiceForm";
import { ServiceList } from "./ServiceList";

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: services } = await supabase
    .from("services")
    .select("id, name, description, price, is_available, availability_note")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  const { data: business } = await supabase
    .from("businesses")
    .select("currency")
    .eq("id", businessId)
    .maybeSingle();

  return (
    <div>
      <Link href={`/admin/businesses/${businessId}`} className="text-sm text-slate-500 hover:underline">
        ← Back
      </Link>
      <h1 className="mb-6 mt-2 text-xl font-semibold">Services</h1>

      <ServiceList services={services ?? []} currency={business?.currency ?? ""} />

      <NewServiceForm businessId={businessId} />
    </div>
  );
}
