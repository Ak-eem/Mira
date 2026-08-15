"use client";

import { useState } from "react";
import { updateSubscription } from "./subscription-actions";

type Subscription = {
  plan: "base" | "pro";
  nudges_addon: boolean;
  nudges_tier: "basic" | "plus" | null;
  max_nudges_per_customer_per_week: number;
  status: "active" | "past_due" | "cancelled";
} | null;

export function SubscriptionPanel({ businessId, subscription }: { businessId: string; subscription: Subscription }) {
  const [plan, setPlan] = useState(subscription?.plan ?? "base");
  const [nudgesAddon, setNudgesAddon] = useState(subscription?.nudges_addon ?? false);
  const [nudgesTier, setNudgesTier] = useState(subscription?.nudges_tier ?? "");
  const [maxPerWeek, setMaxPerWeek] = useState(String(subscription?.max_nudges_per_customer_per_week ?? 2));
  const [status, setStatus] = useState(subscription?.status ?? "active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateSubscription({
      businessId,
      plan,
      nudgesAddon,
      nudgesTier: nudgesTier as "basic" | "plus" | "",
      maxNudgesPerCustomerPerWeek: maxPerWeek,
      status,
    });
    setSaving(false);
    if (result.error) setError(result.error);
    else setSavedAt(Date.now());
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="mb-3 text-sm font-medium text-slate-700">
        Subscription <span className="font-normal text-slate-400">— set manually, no payment gateway wired up yet</span>
      </p>

      <div className="space-y-3">
        <div className="flex gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600">Plan</label>
            <select
              className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm"
              value={plan}
              onChange={(e) => setPlan(e.target.value as "base" | "pro")}
            >
              <option value="base">Base</option>
              <option value="pro">Pro</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Status</label>
            <select
              className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as "active" | "past_due" | "cancelled")}
            >
              <option value="active">Active</option>
              <option value="past_due">Past due</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={nudgesAddon} onChange={(e) => setNudgesAddon(e.target.checked)} />
          Nudges add-on active
        </label>

        {nudgesAddon && (
          <div className="flex gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">Nudges tier</label>
              <select
                className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm"
                value={nudgesTier}
                onChange={(e) => setNudgesTier(e.target.value)}
              >
                <option value="">Choose…</option>
                <option value="basic">Basic — ₦5,000/mo</option>
                <option value="plus">Plus — ₦10,000/mo</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Max nudges/customer/week</label>
              <input
                type="number"
                min={1}
                className="mt-1 w-24 rounded border border-slate-300 px-3 py-2 text-sm"
                value={maxPerWeek}
                onChange={(e) => setMaxPerWeek(e.target.value)}
              />
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {savedAt && <span className="text-xs text-emerald-600">Saved</span>}
        </div>
      </div>
    </div>
  );
}
