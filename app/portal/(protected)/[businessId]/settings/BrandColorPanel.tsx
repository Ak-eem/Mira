"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  checkChatColors,
  chatThemeVars,
  DEFAULT_BRAND_COLOR,
  DEFAULT_CHAT_BACKGROUND,
  parseBrandColor,
} from "@/lib/brandColor";
import { saveChatColors } from "./actions";

function ColorField({
  label,
  hint,
  text,
  setText,
  fallback,
  disabled,
}: {
  label: string;
  hint: string;
  text: string;
  setText: (value: string) => void;
  fallback: string;
  disabled: boolean;
}) {
  const parsed = parseBrandColor(text);
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-slate-500">{hint}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input
          type="color"
          aria-label={`Pick the ${label.toLowerCase()}`}
          value={parsed ?? fallback}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          className="h-11 w-14 cursor-pointer rounded-xl border border-slate-200 bg-white p-1 disabled:cursor-not-allowed"
        />
        <input
          type="text"
          aria-label={`${label} hex code`}
          value={text}
          placeholder="Default"
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          maxLength={7}
          spellCheck={false}
          className="w-28 ui-field font-mono uppercase focus:border-accent focus:outline-hidden focus:ring-1 focus:ring-accent"
        />
        {text !== "" && !disabled && (
          <button type="button" onClick={() => setText("")} className="text-xs font-medium text-slate-500 underline-offset-2 hover:underline">
            Use Mira&apos;s default
          </button>
        )}
      </div>
    </div>
  );
}

export function BrandColorPanel({
  businessId,
  businessName,
  initialBrand,
  initialBackground,
  canEdit,
}: {
  businessId: string;
  businessName: string;
  initialBrand: string | null;
  initialBackground: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState({ brand: initialBrand, background: initialBackground });
  // An empty field means "Mira's default".
  const [brandText, setBrandText] = useState(initialBrand ?? "");
  const [backgroundText, setBackgroundText] = useState(initialBackground ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const check = checkChatColors({ brand: brandText, background: backgroundText });
  const dirty = check.ok && (check.brand !== saved.brand || check.background !== saved.background);

  // The preview follows what's typed whenever the pair is usable; otherwise it keeps
  // showing the last saved look. It always sets a background (the default cream when none
  // is chosen), so it matches the real chat whichever theme the portal itself is in.
  const shown = check.ok ? { brand: check.brand, background: check.background } : saved;
  const vars = chatThemeVars(shown.brand ?? DEFAULT_BRAND_COLOR, shown.background ?? DEFAULT_CHAT_BACKGROUND) ?? {};
  const pageBg = vars["--mira-wash"];
  const surface = vars["--mira-surface-strong"];
  const line = vars["--mira-line"];

  async function save() {
    if (!check.ok) return;
    setBusy(true);
    setError(null);
    setNote(null);
    const result = await saveChatColors(businessId, { brand: check.brand, background: check.background });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved({ brand: check.brand, background: check.background });
    setNote("Saved. Your chat now uses these colours.");
    router.refresh();
  }

  return (
    <section className="ui-card space-y-5">
      <div>
        <p className="ui-section-label !ml-0">Chat colours</p>
        <h2 className="mt-1 text-lg font-semibold">Make the chat match your brand</h2>
        <p className="mt-1 text-sm text-slate-500">
          Pick your brand colour and, if your website has a minimal look, the background to match it. Both apply to
          the chat page and your website widget. Text colours adjust themselves so everything stays easy to read.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <ColorField
          label="Brand colour"
          hint="Buttons and your customers' messages."
          text={brandText}
          setText={(v) => {
            setBrandText(v);
            setNote(null);
          }}
          fallback={DEFAULT_BRAND_COLOR}
          disabled={!canEdit}
        />
        <ColorField
          label="Background"
          hint="The chat page behind the messages."
          text={backgroundText}
          setText={(v) => {
            setBackgroundText(v);
            setNote(null);
          }}
          fallback={DEFAULT_CHAT_BACKGROUND}
          disabled={!canEdit}
        />
      </div>

      {!check.ok && (brandText.trim() !== "" || backgroundText.trim() !== "") && (
        <p className="text-sm text-red-600" role="alert">
          {check.error}
        </p>
      )}

      {/* Live preview. Inline styles on purpose: the portal's own dark theme must not bleed in. */}
      <div
        className="max-w-sm space-y-2 rounded-2xl p-4"
        aria-label="Preview"
        style={{ ...(vars as React.CSSProperties), background: pageBg }}
      >
        <p className="text-xs text-slate-500">Preview · {businessName}</p>
        <div className="flex justify-end">
          <span className="inline-block max-w-[85%] rounded-lg bg-accent px-3 py-2 text-sm text-on-accent">Do you deliver to Lekki?</span>
        </div>
        <div>
          <span
            className="inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm text-slate-700"
            style={{ background: surface, border: `1px solid ${line}` }}
          >
            Yes! Delivery to Lekki is ₦2,000.
          </span>
        </div>
        <span className="inline-block rounded-sm bg-accent px-3 py-1.5 text-xs font-medium text-on-accent">Send</span>
      </div>

      {!canEdit && <p className="text-xs text-slate-500">Only the business owner can change this.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {note && <p className="text-sm text-emerald-600">{note}</p>}
      <p className="text-xs text-slate-500">Changes can take up to a minute to reach live chats.</p>

      {canEdit && (
        <button type="button" onClick={save} disabled={busy || !dirty} className="ui-btn ui-btn-primary">
          {busy ? "Saving…" : "Save colours"}
        </button>
      )}
    </section>
  );
}
