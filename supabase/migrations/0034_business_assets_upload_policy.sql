drop policy if exists "business assets upload" on storage.objects;

create policy "business assets upload"
  on storage.objects for insert
  with check (
    bucket_id = 'business-assets'
    and (metadata->>'mimetype') like 'image/%'
    and (metadata->>'size')::bigint <= 2097152
  );