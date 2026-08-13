"use client";

import { useState } from "react";

// window.location.origin is read at click time, not hardcoded -- this
// produces the right URL whether you're testing on localhost or this
// is actually deployed somewhere real later, with no code change either way.
export function CopyLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/chat/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail depending on browser/context --
      // fall back to something the admin can still copy manually
      // rather than silently doing nothing.
      prompt("Copy this link:", url);
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent"
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
