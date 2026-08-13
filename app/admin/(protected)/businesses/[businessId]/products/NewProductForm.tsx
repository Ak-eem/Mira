"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createProduct, uploadProductImage } from "./actions";

export function NewProductForm({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stockQuantity, setStockQuantity] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [availabilityNote, setAvailabilityNote] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await createProduct({
      businessId, name, description, price, stockQuantity, isAvailable, availabilityNote,
    });

    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    if (imageFile && result.id) {
      const formData = new FormData();
      formData.set("image", imageFile);
      const imageResult = await uploadProductImage(result.id, formData);
      if (imageResult?.error) {
        // Product was created successfully -- surface the image failure
        // separately rather than treating the whole submission as failed.
        setError(`Product added, but the photo didn't upload: ${imageResult.error}`);
        setSubmitting(false);
        router.refresh();
        return;
      }
    }

    setName("");
    setDescription("");
    setPrice("");
    setStockQuantity("");
    setIsAvailable(true);
    setAvailabilityNote("");
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Add a product</h2>

      <input
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        placeholder="Name (e.g. Ankara Tote Bag)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          placeholder="Price"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          required
        />
        <input
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          placeholder="Stock (blank = untracked)"
          value={stockQuantity}
          onChange={(e) => setStockQuantity(e.target.value)}
          inputMode="numeric"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} />
        Available
      </label>
      {!isAvailable && (
        <input
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          placeholder="Note (e.g. 'restocking next week')"
          value={availabilityNote}
          onChange={(e) => setAvailabilityNote(e.target.value)}
        />
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Photo (optional, JPEG/PNG/WebP/GIF, up to 5MB)</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add product"}
      </button>
    </form>
  );
}
