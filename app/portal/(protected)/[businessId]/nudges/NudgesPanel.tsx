"use client";

import { useState } from "react";
import { upsertNudgeRule } from "./actions";

type Rule = {
  trigger_type: "order_shipped" | "restock_alert" | "abandoned_cart";
  template_name: string | null;
  condition_json: { hours_threshold?: number } | null;
  is_active: boolean;
};

const TRIGGER_INFO: Record<Rule["trigger_type"], { title: string; description: string }> = {
  order_shipped: {
    title: "Order shipped",
    description: "Sent once when an order's status changes to Shipped.",
  },
  restock_alert: {
    title: "Restock alert",
    description: "Sent to customers who asked about a product once it's back in stock.",
  },
  abandoned_cart: {
    title: "Abandoned cart",
    description: "Sent once a cart has sat untouched past the hours below.",
  },
};

function RuleCard({ businessId, rule }: { businessId: string; rule: Rule }) {
  const info = TRIGGER_INFO[rule.trigger_type];
  const [templateName, setTemplateName] = useState(rule.template_name ?? "");
  const [hoursThreshold, setHoursThreshold] = useState(String(rule.condition_json?.hours_threshold ?? 24));
  const [isActive, setIsActive] = useState(rule.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await upsertNudgeRule({
      businessId,
      triggerType: rule.trigger_type,
      templateName,
      hoursThreshold,
      isActive,
    });
    setSaving(false);
    if (result.error) setError(result.error);
    else setSavedAt(Date.now());
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <p className="font-medium text-slate-900">{info.title}</p>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
      </div>
      <p className="mb-4 text-sm text-slate-500">{info.description}</p>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600">
            Meta template name <span className="font-normal text-slate-400">— leave blank until yours is approved</span>
          </label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
            placeholder="e.g. order_shipped_v1"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
          />
        </div>

        {rule.trigger_type === "abandoned_cart" && (
          <div>
            <label className="block text-xs font-medium text-slate-600">Cart age threshold (hours)</label>
            <input
              type="number"
              min={1}
              className="mt-1 w-32 rounded border border-slate-300 px-3 py-2 text-sm"
              value={hoursThreshold}
              onChange={(e) => setHoursThreshold(e.target.value)}
            />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {savedAt && <span className="text-xs text-emerald-600">Saved</span>}
        </div>
      </div>
    </div>
  );
}

export function NudgesPanel({ businessId, rules }: { businessId: string; rules: Rule[] }) {
  const byType = new Map(rules.map((r) => [r.trigger_type, r]));
  const allTypes: Rule["trigger_type"][] = ["order_shipped", "restock_alert", "abandoned_cart"];

  return (
    <div className="space-y-4">
      {allTypes.map((type) => (
        <RuleCard
          key={type}
          businessId={businessId}
          rule={byType.get(type) ?? { trigger_type: type, template_name: null, condition_json: null, is_active: false }}
        />
      ))}
    </div>
  );
}
