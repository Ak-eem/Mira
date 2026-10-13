import { createClient } from "@/lib/supabase/server";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { NewProductForm } from "@/app/admin/(protected)/businesses/[businessId]/products/NewProductForm";
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
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Products</h1>
      <p className="mb-6 mt-1 text-sm text-muted">What Mira tells customers about price, stock and availability.</p>

      <ProductList products={products ?? []} currency={business?.currency ?? ""} />

      <NewProductForm businessId={businessId} />
    </div>
  );
}
