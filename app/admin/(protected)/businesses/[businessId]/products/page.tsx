import Link from "next/link";
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
      <Link href={`/admin/businesses/${businessId}`} className="text-sm text-slate-500 hover:underline">
        ← Back
      </Link>
      <h1 className="mb-6 mt-2 text-xl font-semibold">Products</h1>

      <ProductList products={products ?? []} currency={business?.currency ?? ""} />

      <NewProductForm businessId={businessId} />
    </div>
  );
}
