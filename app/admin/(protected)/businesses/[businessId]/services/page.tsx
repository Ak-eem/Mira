import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddSheet } from "@/components/ui/Sheet";
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
      <PageHeader
        title="Services"
        subtitle="The services you offer and their prices."
        action={services?.length ? (
          <AddSheet label="Add service">
            <NewServiceForm businessId={businessId} />
          </AddSheet>
        ) : undefined}
      />

      {services?.length ? (
        <ServiceList services={services} currency={business?.currency ?? ""} />
      ) : (
        <EmptyState
          icon="list"
          title="No services yet"
          description="Add the services you offer so Mira can tell customers what they cost."
          action={
            <AddSheet label="Add your first service">
              <NewServiceForm businessId={businessId} />
            </AddSheet>
          }
        />
      )}
    </div>
  );
}
