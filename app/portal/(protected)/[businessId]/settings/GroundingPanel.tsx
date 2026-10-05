"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveGroundingSettings } from "./actions";

export function GroundingPanel({
  businessId,
  initialLevel,
  initialEscalate,
  canEdit,
}: {
  businessId: string;
  initialLevel: "low" | "medium";
  initialEscalate: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [level, setLevel] = useState<"low" | "medium">(initialLevel);
  const [escalate, setEscalate] = useState(initialEscalate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await saveGroundingSettings(businessId, level, escalate);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Answer check</p>
        <h2 className="mt-1 text-lg font-semibold">Flag replies that don&apos;t match your business info</h2>
        <p className="mt-1 text-sm text-slate-500">
          After each reply, Mira compares the prices, opening times, links, contact details and policies it mentioned
          with what you&apos;ve told her. Replies that don&apos;t match appear on the Review page. Customers never see
          this, and it doesn&apos;t slow replies down. It can&apos;t catch every mistake, only ones involving those facts.
        </p>
      </div>

      <fieldset className="space-y-2" disabled={!canEdit}>
        <legend className="text-sm font-medium text-slate-700">What goes on the Review page</legend>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="radio" name="level" checked={level === "low"} onChange={() => setLevel("low")} className="mt-1" />
          <span>
            Only clear mismatches <span className="text-slate-400">(a price, time, link or contact that isn&apos;t in your info)</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="radio" name="level" checked={level === "medium"} onChange={() => setLevel("medium")} className="mt-1" />
          <span>
            Mismatches and unsupported policy claims too <span className="text-slate-400">(like delivery or refunds you haven&apos;t described)</span>
          </span>
        </label>
      </fieldset>

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={escalate}
          disabled={!canEdit}
          onChange={(e) => setEscalate(e.target.checked)}
          className="mt-1 h-4 w-4 rounded-sm border-slate-300"
        />
        <span>
          Hand the chat to my team after two weak replies in a row
          <span className="block text-xs text-slate-400">
            Off by default. A single weak reply never interrupts a customer; this only steps in when it repeats.
          </span>
        </span>
      </label>

      {!canEdit && <p className="text-xs text-slate-400">Only the business owner can change this.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {canEdit && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      )}
    </section>
  );
}
