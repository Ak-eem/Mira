"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateBusiness } from "./actions";
import type { Business } from "@/lib/types";

export function SettingsForm({ business }: { business: Business }) {
  const router = useRouter();
  const [name, setName] = useState(business.name);
  const [slug, setSlug] = useState(business.slug);
  const [description, setDescription] = useState(business.description ?? "");
  const [currency, setCurrency] = useState(business.currency);
  const [timezone, setTimezone] = useState(business.timezone);
  const [aiTone, setAiTone] = useState(business.ai_tone ?? "");
  const [aiInstructions, setAiInstructions] = useState(business.ai_instructions ?? "");
  const [hoursNote, setHoursNote] = useState(business.hours_note ?? "");
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState(business.whatsapp_phone_number_id ?? "");
  const [isActive, setIsActive] = useState(business.is_active);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const result = await updateBusiness({
      businessId: business.id, name, slug, description, currency, timezone,
      aiTone, aiInstructions, hoursNote, whatsappPhoneNumberId, isActive,
    });

    if (result?.error) {
      setError(result.error);
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">Name</label>
        <input className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          Slug <span className="font-normal text-slate-400">— /chat/{slug || "…"}</span>
        </label>
        <input
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          pattern="[a-z0-9-]+"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Description</label>
        <textarea className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-700">Currency</label>
          <input className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-700">Timezone</label>
          <input className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          AI tone <span className="font-normal text-slate-400">— shapes how Mira talks</span>
        </label>
        <input
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          placeholder="e.g. friendly, casual, short sentences"
          value={aiTone}
          onChange={(e) => setAiTone(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          Additional instructions <span className="font-normal text-slate-400">— optional</span>
        </label>
        <textarea
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          rows={2}
          placeholder="e.g. Always mention we're cash-only on Mondays"
          value={aiInstructions}
          onChange={(e) => setAiInstructions(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          Hours note <span className="font-normal text-slate-400">— exceptions that don't fit the weekly pattern</span>
        </label>
        <input
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          placeholder="e.g. Closed on public holidays"
          value={hoursNote}
          onChange={(e) => setHoursNote(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          WhatsApp phone number ID <span className="font-normal text-slate-400">— optional, from Meta's WhatsApp Business API setup</span>
        </label>
        <input
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
          placeholder="e.g. 109876543212345"
          value={whatsappPhoneNumberId}
          onChange={(e) => setWhatsappPhoneNumberId(e.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active <span className="text-slate-400">— unchecking pauses the chat without deleting anything</span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-emerald-600">Saved</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
