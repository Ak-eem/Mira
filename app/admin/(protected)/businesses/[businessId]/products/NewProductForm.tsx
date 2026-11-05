"use client";

import { useSheetClose } from "@/components/ui/Sheet";
import { useSnackbar } from "@/components/ui/Feedback";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createProduct, uploadProductImage } from "./actions";

export function NewProductForm({ businessId }: { businessId: string }) {
  const closeSheet = useSheetClose();
  const snack = useSnackbar();
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
    snack({ message: "Product added" });
    closeSheet();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      <div>
        <label htmlFor="f-name" className="ui-label">Name</label>
        <input id="f-name"
        className="ui-field" placeholder="e.g. Ankara Tote Bag"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required />
      </div>
      <div>
        <label htmlFor="f-description-optional" className="ui-label">Description (optional)</label>
        <input id="f-description-optional"
        className="ui-field"
        value={description}
        onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
        <label htmlFor="f-price" className="ui-label">Price</label>
        <input id="f-price"
          className="ui-field"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          required />
      </div>
        <div className="flex-1">
        <label htmlFor="f-stock" className="ui-label">Stock</label>
        <input id="f-stock"
          className="ui-field"
          value={stockQuantity}
          onChange={(e) => setStockQuantity(e.target.value)}
          inputMode="numeric" />
        <p className="ui-hint mt-1">Blank = untracked</p>
      </div>
      </div>
      <label className="ui-row justify-between rounded-xl bg-white shadow-[0_0_0_1px_rgb(15_42_34/0.06)]">
        <span className="text-[15px] font-medium text-slate-900">Available</span>
        <input type="checkbox" role="switch" className="ui-switch" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} />
      </label>
      {!isAvailable && (
        <div>
        <label htmlFor="f-note" className="ui-label">Note</label>
        <input id="f-note"
          className="ui-field" placeholder="e.g. 'restocking next week'"
          value={availabilityNote}
          onChange={(e) => setAvailabilityNote(e.target.value)} />
      </div>
      )}

      <div>
        <label className="ui-label">Photo (optional, JPEG/PNG/WebP/GIF, up to 5MB)</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm text-slate-600 file:mr-3 file:rounded-sm file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className="ui-btn ui-btn-primary w-full"
      >
        {submitting ? "Adding…" : "Add product"}
      </button>
    </form>
  );
}
