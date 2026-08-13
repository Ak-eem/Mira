"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveHours, type DayInput } from "./actions";

export function HoursForm({
  businessId,
  initialDays,
}: {
  businessId: string;
  initialDays: (DayInput & { name: string })[];
}) {
  const router = useRouter();
  const [days, setDays] = useState(initialDays);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateDay(index: number, patch: Partial<DayInput>) {
    setDays((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await saveHours(businessId, days);

    if (result?.error) {
      setError(result.error);
      setSaving(false);
      return;
    }

    router.refresh();
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {days.map((d, i) => (
        <div key={d.day_of_week} className="flex flex-wrap items-center gap-3 rounded border border-slate-200 bg-white p-3">
          <span className="w-24 text-sm font-medium">{d.name}</span>
          <label className="flex items-center gap-1 text-xs text-slate-500">
            <input type="checkbox" checked={d.closed} onChange={(e) => updateDay(i, { closed: e.target.checked })} />
            Closed
          </label>
          {!d.closed && (
            <>
              <input
                type="time"
                value={d.opens_at}
                onChange={(e) => updateDay(i, { opens_at: e.target.value })}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <span className="text-slate-400">–</span>
              <input
                type="time"
                value={d.closes_at}
                onChange={(e) => updateDay(i, { closes_at: e.target.value })}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </>
          )}
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save hours"}
      </button>
    </form>
  );
}
