"use client";

import { useEffect, useState } from "react";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function EmbedSnippet({ slug, businessName }: { slug: string; businessName: string }) {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keep the server and initial client render identical, then use the browser's origin after mount.
  const origin = mounted && typeof window !== "undefined" ? window.location.origin : "";
  const snippet = `<script src="${escapeHtml(origin)}/embed.js"
        data-business="${escapeHtml(slug)}"
        data-title="Chat with ${escapeHtml(businessName)}"
        data-primary-color="#0f766e"
        defer></script>`;

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
        Paste this one snippet just before the closing <code className="rounded bg-slate-100 px-1 py-0.5">&lt;/body&gt;</code> tag on your site. No account, no build step, works on any platform.
      </p>
      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
        <code>{snippet}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
      >
        {copied ? "Copied!" : "Copy snippet"}
      </button>
    </section>
  );
}
