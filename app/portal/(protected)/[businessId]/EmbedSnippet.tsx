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
  const [copied, setCopied] = useState(false);

  // Starts empty so the server-rendered HTML and the client's first
  // render pass match exactly (both show the placeholder) -- computing
  // window.location.origin directly during render, instead of in an
  // effect, would give the server "" and the client's hydration pass
  // the real origin in the same render, which is exactly what triggers
  // a hydration mismatch. The effect runs after hydration completes, so
  // the real value swaps in a moment later instead.
  const [origin, setOrigin] = useState("");
  const [placement, setPlacement] = useState<Placement>("right");
  useEffect(() => {
    // window.location.origin only exists client-side; a lazy useState initializer would
    // run during SSR too and throw (window is not defined). This effect + empty-string
    // start is what keeps the server and first client render identical (see above).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  // Business-supplied values going into HTML attributes -- a name with
  // a quote in it would break out of data-title's quotes, and
  // "</script>" anywhere in either value would close the tag early and
  // let arbitrary markup follow. Escaped the same way the email
  // templates already do it (lib/escapeHtml.ts), not a one-off here.
  const safeSlug = escapeHtml(slug);
  const safeBusinessName = escapeHtml(businessName);

  const snippet = origin
    ? `<script src="${origin}/embed.js"
        data-business="${safeSlug}"
        data-title="Chat with ${safeBusinessName}"
        data-primary-color="#0f766e"${placement.startsWith("left") ? '\n        data-position="left"' : ""}${placement.endsWith("raised") ? '\n        data-offset-y="90"' : ""}
        defer></script>`
    : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (permissions, insecure context) -- the
      // snippet is still selectable/copyable by hand below, so this
      // isn't a dead end, just a missed convenience.
    }
  }

  return (
    <section className="glass-panel rounded-xl p-5">
      <h2 className="mb-1 text-sm font-semibold text-slate-800">Add Mira to your website</h2>
      <p className="mb-3 text-xs text-slate-500">
        Paste this one snippet just before the closing <code className="rounded-sm bg-slate-100 px-1 py-0.5">&lt;/body&gt;</code> tag on your site. No account, no build step, works on any platform.
      </p>
      <label htmlFor="widget-placement" className="mb-1 block text-xs font-medium text-slate-700">Where should the chat button sit?</label>
      <select
        id="widget-placement"
        value={placement}
        onChange={(e) => setPlacement(e.target.value as Placement)}
        className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800"
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
        onClick={copy}
        disabled={!snippet}
        className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {copied ? "Copied!" : "Copy snippet"}
      </button>
    </section>
  );
}
