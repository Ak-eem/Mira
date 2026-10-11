import { createClient } from "@/lib/supabase/server";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { NewServiceForm } from "@/app/admin/(protected)/businesses/[businessId]/services/NewServiceForm";
import { ServiceList } from "@/app/admin/(protected)/businesses/[businessId]/services/ServiceList";

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const owner = await getCurrentBusinessOwner();
  if (owner?.businesses.find((b) => b.id === businessId)?.role !== "owner") {
    return <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">Only the business owner can edit this.</p>;
  }
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
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Services</h1>
      <p className="mb-6 mt-1 text-sm text-muted">The services you offer and their prices.</p>

      <ServiceList services={services ?? []} currency={business?.currency ?? ""} />

      <NewServiceForm businessId={businessId} />
    </div>
  );
}
