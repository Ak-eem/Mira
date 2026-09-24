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
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Additional section</p>
        <h2 className="mt-1 text-lg font-semibold">Inventory assistant</h2>
        <p className="mt-1 text-sm text-slate-500">
          Owner-facing toggle -- lets the business owner have Mira make stock/price/availability
          changes via the portal, with their confirmation required. Off by default; this doesn&apos;t
          affect Command Center access here in admin either way.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Owner can use the inventory assistant
      </label>

      <div>
        <label className="block text-sm font-medium text-slate-700">Which AI agent</label>
        <select
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
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
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </section>
  );
}
