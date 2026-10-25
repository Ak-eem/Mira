"use client";

import { useSheetClose } from "@/components/ui/Sheet";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createService } from "./actions";

export function NewServiceForm({ businessId }: { businessId: string }) {
  const closeSheet = useSheetClose();
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
    closeSheet();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      <div>
        <label htmlFor="f-name" className="ui-label">Name</label>
        <input id="f-name"
        className="ui-field" placeholder="e.g. Haircut"
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
      <div>
        <label htmlFor="f-price" className="ui-label">Price</label>
        <input id="f-price"
        className="ui-field"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        inputMode="decimal" />
        <p className="ui-hint mt-1">Leave blank for &lsquo;price on request&rsquo;</p>
      </div>
      <label className="ui-row justify-between rounded-xl bg-white shadow-[0_0_0_1px_rgb(15_42_34/0.06)]">
        <span className="text-[15px] font-medium text-slate-900">Available</span>
        <input type="checkbox" role="switch" className="ui-switch" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} />
      </label>
      {!isAvailable && (
        <div>
        <label htmlFor="f-note" className="ui-label">Note</label>
        <input id="f-note"
          className="ui-field" placeholder="e.g. 'fully booked this week'"
          value={availabilityNote}
          onChange={(e) => setAvailabilityNote(e.target.value)} />
      </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className="ui-btn ui-btn-primary w-full"
      >
        {submitting ? "Adding…" : "Add service"}
      </button>
    </form>
  );
}
