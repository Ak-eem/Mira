import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddSheet } from "@/components/ui/Sheet";
import { createClient } from "@/lib/supabase/server";
import { NewProductForm } from "./NewProductForm";
import { ProductList } from "./ProductList";

export default async function ProductsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: products } = await supabase
    .from("products")
    .select("id, name, description, price, stock_quantity, is_available, availability_note, image_url")
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
        title="Products"
        subtitle="What Mira tells customers about price, stock and availability."
        action={products?.length ? (
          <AddSheet fab label="Add product">
            <NewProductForm businessId={businessId} />
          </AddSheet>
        ) : undefined}
      />

      {products?.length ? (
        <ProductList products={products} currency={business?.currency ?? ""} />
      ) : (
        <EmptyState
          icon="bag"
          title="No products yet"
          description="Add what you sell, with prices and stock, so Mira can answer customers accurately."
          action={
            <AddSheet label="Add your first product">
              <NewProductForm businessId={businessId} />
            </AddSheet>
          }
        />
      )}
    </div>
  );
}
