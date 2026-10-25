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
  const [saved, setSaved] = useState(false);

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
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="ui-group">
        {days.map((d, i) => (
          <div key={d.day_of_week} className="ui-row flex-wrap">
            <span className="w-28 text-[15px] font-medium text-slate-900">{d.name}</span>
            <span className="ml-auto flex items-center gap-3">
              {d.closed ? (
                <span className="text-sm text-slate-500">Closed</span>
              ) : (
                <>
                  <input type="time" aria-label={`${d.name} opens`} value={d.opens_at} onChange={(e) => updateDay(i, { opens_at: e.target.value })} className="ui-field w-auto min-w-[7.5rem]" />
                  <span aria-hidden className="text-slate-400">&ndash;</span>
                  <input type="time" aria-label={`${d.name} closes`} value={d.closes_at} onChange={(e) => updateDay(i, { closes_at: e.target.value })} className="ui-field w-auto min-w-[7.5rem]" />
                </>
              )}
              <input type="checkbox" role="switch" aria-label={`Open on ${d.name}`} className="ui-switch" checked={!d.closed} onChange={(e) => updateDay(i, { closed: !e.target.checked })} />
            </span>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} aria-busy={saving} className="ui-btn ui-btn-primary">{saving ? "Saving…" : "Save hours"}</button>
        {saved && <span className="text-sm font-medium text-emerald-700" role="status">&#10003; Saved</span>}
      </div>
    </form>
  );
}
