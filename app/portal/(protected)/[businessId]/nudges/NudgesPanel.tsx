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
    <div className="ui-card">
      <label className="mb-4 flex cursor-pointer items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="block text-[17px] font-semibold tracking-tight text-slate-900">{info.title}</span>
          <span className="ui-hint mt-0.5 block">{info.description}</span>
        </span>
        <input type="checkbox" role="switch" aria-label={`${info.title} active`} className="ui-switch mt-1" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
      </label>

      <div className="space-y-3">
        <div>
          <label className="ui-label">
            Meta template name <span className="font-normal text-slate-500">(the WhatsApp message template your business has had approved by Meta; leave blank until then)</span>
          </label>
          <input
            className="ui-field font-mono text-sm"
            placeholder={`e.g. ${rule.trigger_type}_v1`}
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
          />
        </div>

        {rule.trigger_type === "abandoned_cart" && (
          <div>
            <label className="ui-label">Cart age threshold (hours)</label>
            <input
              type="number"
              min={1}
              className="ui-field w-32"
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
            className="ui-btn ui-btn-primary ui-btn-sm" aria-busy={saving}
          >
            {saving ? "Saving…" : "Save rule"}
          </button>
          {savedAt && <span className="text-sm font-medium text-emerald-700" role="status">&#10003; Saved</span>}
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
