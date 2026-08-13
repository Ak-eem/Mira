"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { updateProduct, deleteProduct, uploadProductImage, removeProductImage } from "./actions";

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock_quantity: number | null;
  is_available: boolean;
  availability_note: string | null;
  image_url: string | null;
};

export function ProductList({ products, currency }: { products: Product[]; currency: string }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (products.length === 0) {
    return <p className="mb-6 text-sm text-slate-500">No products yet.</p>;
  }

  return (
    <ul className="mb-6 space-y-2">
      {products.map((p) =>
        editingId === p.id ? (
          <EditProductRow
            key={p.id}
            product={p}
            onDone={() => {
              setEditingId(null);
              router.refresh();
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <li key={p.id} className="flex gap-3 rounded border border-slate-200 bg-white p-3">
            {p.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image_url} alt={p.name} className="h-14 w-14 flex-shrink-0 rounded object-cover" />
            ) : (
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded bg-slate-100 text-xs text-slate-400">
                No photo
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">{p.name}</span>
                <span className="font-mono text-sm text-slate-500">{currency} {p.price}</span>
              </div>
              {p.description && <p className="mt-1 text-sm text-slate-500">{p.description}</p>}
              <p className="mt-1 text-xs text-slate-400">
                {p.stock_quantity != null ? `${p.stock_quantity} in stock` : "Stock not tracked"}
              </p>
              {!p.is_available && (
                <p className="mt-1 text-xs text-amber-600">
                  Unavailable{p.availability_note ? ` — ${p.availability_note}` : ""}
                </p>
              )}
              <div className="mt-2 flex gap-3 text-xs">
                <button onClick={() => setEditingId(p.id)} className="text-accent hover:underline">
                  Edit
                </button>
                <button
                  onClick={async () => {
                    if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return;
                    await deleteProduct(p.id);
                    router.refresh();
                  }}
                  className="text-red-600 hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        )
      )}
    </ul>
  );
}

function EditProductRow({
  product,
  onDone,
  onCancel,
}: {
  product: Product;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? "");
  const [price, setPrice] = useState(product.price.toString());
  const [stockQuantity, setStockQuantity] = useState(product.stock_quantity?.toString() ?? "");
  const [isAvailable, setIsAvailable] = useState(product.is_available);
  const [availabilityNote, setAvailabilityNote] = useState(product.availability_note ?? "");
  const [imageUrl, setImageUrl] = useState(product.image_url);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateProduct({
      productId: product.id, name, description, price, stockQuantity, isAvailable, availabilityNote,
    });
    if (result?.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    onDone();
  }

  async function handleImagePicked(file: File | undefined) {
    if (!file) return;
    setImageBusy(true);
    setError(null);
    const formData = new FormData();
    formData.set("image", file);
    const result = await uploadProductImage(product.id, formData);
    if (result?.error) {
      setError(result.error);
    } else if (result?.imageUrl) {
      setImageUrl(result.imageUrl);
    }
    setImageBusy(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleRemoveImage() {
    setImageBusy(true);
    setError(null);
    const result = await removeProductImage(product.id);
    if (result?.error) {
      setError(result.error);
    } else {
      setImageUrl(null);
    }
    setImageBusy(false);
  }

  return (
    <li className="space-y-2 rounded border border-accent bg-white p-3">
      <div className="flex items-center gap-3">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={name} className="h-14 w-14 flex-shrink-0 rounded object-cover" />
        ) : (
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded bg-slate-100 text-xs text-slate-400">
            No photo
          </div>
        )}
        <div className="flex flex-col gap-1 text-xs">
          <label className="cursor-pointer text-accent hover:underline">
            {imageBusy ? "Working…" : imageUrl ? "Replace photo" : "Add photo"}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => handleImagePicked(e.target.files?.[0])}
              disabled={imageBusy}
              className="hidden"
            />
          </label>
          {imageUrl && (
            <button onClick={handleRemoveImage} disabled={imageBusy} className="text-left text-red-600 hover:underline disabled:opacity-50">
              Remove photo
            </button>
          )}
        </div>
      </div>
      <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
      <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
      <div className="flex gap-2">
        <input className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" inputMode="decimal" />
        <input className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)} placeholder="Stock (blank = untracked)" inputMode="numeric" />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} />
        Available
      </label>
      {!isAvailable && (
        <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={availabilityNote} onChange={(e) => setAvailabilityNote(e.target.value)} placeholder="Note" />
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="rounded bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} className="rounded border border-slate-300 px-3 py-1 text-xs">
          Cancel
        </button>
      </div>
    </li>
  );
}
