"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { brandTheme, checkBrandColor, DEFAULT_BRAND_COLOR, parseBrandColor } from "@/lib/brandColor";
import { saveBrandColor } from "./actions";

export function BrandColorPanel({
  businessId,
  businessName,
  initialColor,
  canEdit,
}: {
  businessId: string;
  businessName: string;
  initialColor: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<string | null>(initialColor);
  const [text, setText] = useState(initialColor ?? DEFAULT_BRAND_COLOR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const parsed = parseBrandColor(text);
  const check = checkBrandColor(text);
  // The preview follows what's typed whenever it's a usable colour, so owners see the
  // result before saving. An unusable colour keeps showing the last good one.
  const previewColor = check.ok ? check.color : (saved ?? DEFAULT_BRAND_COLOR);
  const theme = brandTheme(previewColor);
  const dirty = (check.ok ? check.color : null) !== (saved ?? DEFAULT_BRAND_COLOR) && !(saved === null && parsed === DEFAULT_BRAND_COLOR);

  async function persist(next: string | null) {
    setBusy(true);
    setError(null);
    setNote(null);
    const result = await saveBrandColor(businessId, next);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(next);
    setText(next ?? DEFAULT_BRAND_COLOR);
    setNote(next ? "Saved. Your chat now uses this colour." : "Back to Mira's default colour.");
    router.refresh();
  }

  return (
    <section className="ui-card space-y-4">
      <div>
        <p className="ui-section-label !ml-0">Brand colour</p>
        <h2 className="mt-1 text-lg font-semibold">Make the chat match your brand</h2>
        <p className="mt-1 text-sm text-slate-500">
          Pick the main colour of your business. It colours the buttons and your customers&apos; messages in the
          chat page and on your website widget. Text colour adjusts itself so it stays easy to read.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="color"
          aria-label="Pick a colour"
          value={parsed ?? previewColor}
          disabled={!canEdit}
          onChange={(e) => {
            setText(e.target.value);
            setNote(null);
          }}
          className="h-11 w-14 cursor-pointer rounded-xl border border-slate-200 bg-white p-1 disabled:cursor-not-allowed"
        />
        <input
          type="text"
          aria-label="Colour hex code"
          value={text}
          disabled={!canEdit}
          onChange={(e) => {
            setText(e.target.value);
            setNote(null);
          }}
          maxLength={7}
          spellCheck={false}
          className="w-28 ui-field font-mono uppercase focus:border-accent focus:outline-hidden focus:ring-1 focus:ring-accent"
        />
        {!check.ok && text.trim() !== "" && <p className="text-xs text-red-600">{check.error}</p>}
      </div>

      {/* Live preview: a customer's message, Mira's reply and the send button. */}
      <div className="max-w-sm space-y-2 rounded-2xl bg-slate-100/70 p-4" aria-label="Preview">
        <p className="text-xs text-slate-500">Preview · {businessName}</p>
        <div className="flex justify-end">
          <span
            className="inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm"
            style={{ background: theme.accent, color: theme.onAccent }}
          >
            Do you deliver to Lekki?
          </span>
        </div>
        <div>
          <span className="inline-block max-w-[85%] rounded-2xl bg-white px-3.5 py-2 text-sm text-slate-700 ring-1 ring-slate-900/10">
            Yes! Delivery to Lekki is ₦2,000.
          </span>
        </div>
        <span
          className="inline-block rounded-sm px-3 py-1.5 text-xs font-medium"
          style={{ background: theme.accent, color: theme.onAccent }}
        >
          Send
        </span>
      </div>

      {!canEdit && <p className="text-xs text-slate-500">Only the business owner can change this.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {note && <p className="text-sm text-emerald-600">{note}</p>}
      <p className="text-xs text-slate-500">Changes can take up to a minute to reach live chats.</p>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => check.ok && persist(check.color)}
            disabled={busy || !check.ok || !dirty}
            className="ui-btn ui-btn-primary"
          >
            {busy ? "Saving…" : "Save colour"}
          </button>
          {saved !== null && (
            <button
              type="button"
              onClick={() => persist(null)}
              disabled={busy}
              className="ui-btn ui-btn-secondary"
            >
              Use Mira&apos;s default
            </button>
          )}
        </div>
      )}
    </section>
  );
}
