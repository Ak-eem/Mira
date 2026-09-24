"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveAgentSettings } from "./actions";
import type { ProviderName } from "@/lib/ai/geminiFetch";

export function AgentSettingsPanel({
  businessId,
  initialEnabled,
  initialProvider,
  canEdit,
}: {
  businessId: string;
  initialEnabled: boolean;
  initialProvider: ProviderName;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [provider, setProvider] = useState<ProviderName>(initialProvider);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await saveAgentSettings(businessId, enabled, provider);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Inventory assistant</p>
        <h2 className="mt-1 text-lg font-semibold">Let Mira make changes for you</h2>
        <p className="mt-1 text-sm text-slate-500">
          Off by default. When on, you can tell Mira things like &quot;we&apos;re out of the red
          shirts&quot; and confirm the change yourself -- nothing writes without your confirmation
          either way.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!canEdit}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Allow the inventory assistant to make changes
      </label>

      <div>
        <label className="block text-sm font-medium text-slate-700">Which AI agent</label>
        <select
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
          value={provider}
          disabled={!canEdit}
          onChange={(e) => setProvider(e.target.value as ProviderName)}
        >
          <option value="groq">Groq</option>
          <option value="gemini">Gemini</option>
        </select>
        <p className="mt-1 text-xs text-slate-400">
          If your chosen provider is unavailable, the other one is used automatically as a
          fallback.
        </p>
      </div>

      {!canEdit && (
        <p className="text-xs text-slate-400">Only the business owner can change this.</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {canEdit && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      )}
    </section>
  );
}
