"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createService } from "./actions";

export function NewServiceForm({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [availabilityNote, setAvailabilityNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await createService({
      businessId, name, description, price, isAvailable, availabilityNote,
    });

    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    setName("");
    setDescription("");
    setPrice("");
    setIsAvailable(true);
    setAvailabilityNote("");
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Add a service</h2>

      <input
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        placeholder="Name (e.g. Haircut)"
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
      <input
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        placeholder="Price (leave blank for 'price on request')"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        inputMode="decimal"
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} />
        Available
      </label>
      {!isAvailable && (
        <input
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          placeholder="Note (e.g. 'fully booked this week')"
          value={availabilityNote}
          onChange={(e) => setAvailabilityNote(e.target.value)}
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add service"}
      </button>
    </form>
  );
}
