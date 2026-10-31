"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveAgentSettingsAsAdmin } from "./agent-actions";
import type { ProviderName } from "@/lib/ai/geminiFetch";

export function AgentSettingsPanel({
  businessId,
  initialEnabled,
  initialProvider,
}: {
  businessId: string;
  initialEnabled: boolean;
  initialProvider: ProviderName;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [provider, setProvider] = useState<ProviderName>(initialProvider);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await saveAgentSettingsAsAdmin(businessId, enabled, provider);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Additional section</p>
        <h2 className="mt-1 text-lg font-semibold">Inventory assistant</h2>
        <p className="mt-1 text-sm text-slate-500">
          Always on for owners (migration 0066) -- they have no toggle for it. Every change still
          needs the owner&apos;s own confirmation. This switch is the platform kill switch: turn it
          off to disable the inventory assistant for this one business. It doesn&apos;t affect
          Command Center access here in admin either way.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded-sm border-slate-300"
        />
        Owner can use the inventory assistant
      </label>

      <div>
        <label className="block text-sm font-medium text-slate-700">Which AI agent</label>
        <select
          className="mt-1 w-full ui-field"
          value={provider}
          onChange={(e) => setProvider(e.target.value as ProviderName)}
        >
          <option value="groq">Groq</option>
          <option value="gemini">Gemini</option>
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="ui-btn ui-btn-primary"
      >
        {saving ? "Saving…" : "Save settings"}
      </button>
    </section>
  );
}
