"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPromotion } from "./actions";

export function NewPromotionForm({
  businessId,
  services,
}: {
  businessId: string;
  services: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await createPromotion({ businessId, description, serviceId, startsAt, endsAt });

    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    setDescription("");
    setServiceId("");
    setStartsAt("");
    setEndsAt("");
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Add a promotion</h2>

      <input
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        placeholder="Description (e.g. '20% off all haircuts this week')"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        required
      />

      {services.length > 0 && (
        <select
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
        >
          <option value="">Applies to all services</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name} only</option>
          ))}
        </select>
      )}

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-slate-500">Starts</label>
          <input type="date" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-slate-500">Ends</label>
          <input type="date" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add promotion"}
      </button>
    </form>
  );
}
