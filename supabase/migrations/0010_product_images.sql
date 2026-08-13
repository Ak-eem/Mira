-- Single image_url per product, not a product_images join table. The
-- feature ask was "include image_url in the product context", singular,
-- and nothing today needs a gallery. If multi-photo products become a
-- real need, this column is a straightforward migration to a join table
-- later without touching anything that reads image_url in the meantime.

alter table products add column image_url text;

-- Bucket is public-read: product photos are shown on the public chat page
-- and the embed widget, neither of which has a customer identity to check
-- against. Writes follow the same is_platform_admin() convention as every
-- other admin-owned table in this schema (see 0001, 0005).

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "product images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "admins manage product images"
  on storage.objects for all
  using (bucket_id = 'product-images' and is_platform_admin())
  with check (bucket_id = 'product-images' and is_platform_admin());
