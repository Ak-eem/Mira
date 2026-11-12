"use client";

import { useEffect, useState } from "react";
import { escapeHtml } from "@/lib/escapeHtml";

type Placement = "right" | "left" | "right-raised" | "left-raised";
const PLACEMENTS: Array<{ value: Placement; label: string }> = [
  { value: "right", label: "Bottom right (default)" },
  { value: "left", label: "Bottom left" },
  { value: "right-raised", label: "Bottom right, raised (clears your own floating buttons)" },
  { value: "left-raised", label: "Bottom left, raised" },
];

export function EmbedSnippet({ slug, businessName }: { slug: string; businessName: string }) {
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedBio, setCopiedBio] = useState(false);

  // Starts empty so the server-rendered HTML and the client's first
  // render pass match exactly (both show the placeholder).
  const [origin, setOrigin] = useState("");
  const [placement, setPlacement] = useState<Placement>("right");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const directChatUrl = origin ? `${origin}/chat/${slug}` : "";
  const instagramBioText = `👗 Shop 24/7 & check live sizes with our instant AI: ${directChatUrl}`;

  const safeSlug = escapeHtml(slug);
  const safeBusinessName = escapeHtml(businessName);

  const snippet = origin
    ? `<script src="${origin}/embed.js"
        data-business="${safeSlug}"
        data-title="Chat with ${safeBusinessName}"
        data-primary-color="#0f766e"${placement.startsWith("left") ? '\n        data-position="left"' : ""}${placement.endsWith("raised") ? '\n        data-offset-y="90"' : ""}
        defer></script>`
    : "";

  async function copyText(text: string, setStatus: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(true);
      setTimeout(() => setStatus(false), 2000);
    } catch {
      // Clipboard API failure fallback
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Direct Link for Instagram, TikTok & WhatsApp (No Website Required) */}
      <section className="glass-panel rounded-xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Direct Customer Chat Link</h2>
            <p className="mt-1 text-xs text-slate-500">
              No website needed! Put this link in your Instagram bio, TikTok profile, or WhatsApp Status. Customers can ask prices, check shoe sizes, and order instantly in their browser with zero app downloads and zero WhatsApp API fees.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            Free · Zero Fees
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            readOnly
            value={directChatUrl || "Loading…"}
            aria-label="Direct customer chat URL"
            className="ui-field min-w-0 flex-1 font-mono text-xs text-slate-700 select-all"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => copyText(directChatUrl, setCopiedLink)}
              disabled={!directChatUrl}
              className="ui-btn ui-btn-primary ui-btn-sm shrink-0"
            >
              {copiedLink ? "Copied!" : "Copy link"}
            </button>
            {directChatUrl && (
              <a
                href={directChatUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ui-btn ui-btn-secondary ui-btn-sm shrink-0"
              >
                Open preview ↗
              </a>
            )}
          </div>
        </div>

        {/* Ready-to-use Bio template */}
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="font-semibold text-slate-700">Instagram / WhatsApp Bio Template</span>
            <button
              type="button"
              onClick={() => copyText(instagramBioText, setCopiedBio)}
              className="text-[11px] font-medium text-accent hover:underline"
            >
              {copiedBio ? "Copied bio text!" : "Copy bio template"}
            </button>
          </div>
          <p className="font-mono text-[11px] text-slate-500 bg-white border border-slate-200 rounded px-2.5 py-1.5">
            {instagramBioText}
          </p>
        </div>
      </section>

      {/* 2. Script Tag for Website Owners */}
      <section className="glass-panel rounded-xl p-5">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">Add Mira to your website</h2>
        <p className="mb-3 text-xs text-slate-500">
          If you have your own website, paste this one snippet just before the closing <code className="rounded-sm bg-slate-100 px-1 py-0.5">&lt;/body&gt;</code> tag on your site.
        </p>
        <label htmlFor="widget-placement" className="mb-1 block text-xs font-medium text-slate-700">Where should the chat button sit?</label>
        <select
          id="widget-placement"
          value={placement}
          onChange={(e) => setPlacement(e.target.value as Placement)}
          className="ui-field"
        >
          {PLACEMENTS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
          <code>{snippet || "Loading…"}</code>
        </pre>
        <button
          type="button"
          onClick={() => copyText(snippet, setCopiedSnippet)}
          disabled={!snippet}
          className="ui-btn ui-btn-primary ui-btn-sm mt-3"
        >
          {copiedSnippet ? "Copied!" : "Copy snippet"}
        </button>
      </section>
    </div>
  );
}
