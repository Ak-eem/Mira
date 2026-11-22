import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddSheet } from "@/components/ui/Sheet";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { NewProductForm } from "@/app/admin/(protected)/businesses/[businessId]/products/NewProductForm";
import { ImportProducts } from "@/app/admin/(protected)/businesses/[businessId]/products/ImportProducts";
import { ProductList } from "@/app/admin/(protected)/businesses/[businessId]/products/ProductList";

export default async function ProductsPage({
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
          <div className="flex items-center gap-2">
            <AddSheet label="Import spreadsheet">
              <ImportProducts businessId={businessId} currency={business?.currency ?? "₦"} />
            </AddSheet>
            <AddSheet fab label="Add product">
              <NewProductForm businessId={businessId} />
            </AddSheet>
          </div>
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
            <div className="flex flex-wrap items-center justify-center gap-2">
              <AddSheet label="Add your first product">
                <NewProductForm businessId={businessId} />
              </AddSheet>
              <AddSheet label="Import spreadsheet">
                <ImportProducts businessId={businessId} currency={business?.currency ?? "₦"} />
              </AddSheet>
            </div>
          }
        />
      )}
    </div>
  );
}
