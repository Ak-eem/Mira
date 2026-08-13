"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClosure } from "./actions";

export function NewClosureForm({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await createClosure({ businessId, startsAt, endsAt, reason });

    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    setStartsAt("");
    setEndsAt("");
    setReason("");
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Add a closure</h2>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-slate-500">From</label>
          <input type="datetime-local" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-slate-500">Until</label>
          <input type="datetime-local" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
        </div>
      </div>

      <input
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        placeholder="Reason (optional, e.g. 'Closed for renovation')"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add closure"}
      </button>
    </form>
  );
}
