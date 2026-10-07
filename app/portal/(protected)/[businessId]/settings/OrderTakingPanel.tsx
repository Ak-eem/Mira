"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveOrderTaking } from "./actions";

export function OrderTakingPanel({
  businessId,
  initialEnabled,
  canEdit,
}: {
  businessId: string;
  initialEnabled: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await saveOrderTaking(businessId, enabled);
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
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Order taking</p>
        <h2 className="mt-1 text-lg font-semibold">Let Mira take orders in chat</h2>
        <p className="mt-1 text-sm text-slate-500">
          Off by default. When on, a customer who wants to buy something gets an exact summary from Mira and
          must reply yes before anything is sent. The order then waits for your confirmation on the Orders
          page, and the customer&apos;s chat is flagged for your team until you confirm or cancel it. Mira
          never takes payment.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!canEdit}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded-sm border-slate-300"
        />
        Allow Mira to take orders from customers
      </label>
      <p className="text-xs text-slate-400">Changes can take up to a minute to reach live chats.</p>

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
