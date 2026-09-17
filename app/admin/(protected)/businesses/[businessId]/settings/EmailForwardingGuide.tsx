"use client";

import { useState } from "react";

export function EmailForwardingGuide({ inboundAddress }: { inboundAddress: string | null }) {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    if (!inboundAddress) return;
    try {
      await navigator.clipboard.writeText(inboundAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (permissions, insecure context) -- the
      // address is still visible and selectable above, so this isn't a
      // dead end, just a missed convenience.
    }
  }

  if (!inboundAddress) {
    return (
      <div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
        <p>
          Set up an inbound email address for this business first, then a forwarding guide for Gmail, Outlook, and
          other providers will show up here.
        </p>
        <p className="mt-1">
          Once configured, the address will look something like{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">anything@yourbusiness.resend.app</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-600">
          Forward mail to <span className="font-mono font-medium text-slate-800">{inboundAddress}</span> and Mira
          will pick it up and reply automatically.
        </p>
        <button
          type="button"
          onClick={copyAddress}
          className="flex-shrink-0 self-start rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 sm:self-auto"
        >
          {copied ? "Copied!" : "Copy address"}
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Forwarded mail typically shows up within moments, not hours. Setting up forwarding does not remove mail
        from your existing inbox -- your team keeps receiving copies as normal, this just also sends a copy to
        Mira.
      </p>

      <div className="mt-3 space-y-2">
        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Gmail</summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs text-slate-600">
            <li>Open Gmail settings (the gear icon, then &quot;See all settings&quot;).</li>
            <li>Find the &quot;Forwarding and POP/IMAP&quot; tab.</li>
            <li>
              Click &quot;Add a forwarding address&quot; and enter{" "}
              <span className="font-mono">{inboundAddress}</span>.
            </li>
            <li>Gmail sends a confirmation to that address -- once it&apos;s approved, come back and choose &quot;Forward a copy&quot; for incoming mail.</li>
            <li>Save changes.</li>
          </ol>
        </details>

        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Outlook</summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs text-slate-600">
            <li>Open Settings and look for &quot;Mail&quot; &gt; &quot;Forwarding&quot; (or &quot;Rules&quot; on some Outlook versions).</li>
            <li>
              Turn on forwarding and enter <span className="font-mono">{inboundAddress}</span>.
            </li>
            <li>Keep &quot;Keep a copy of forwarded messages&quot; checked if you want mail to stay in this inbox too.</li>
            <li>Save.</li>
          </ol>
        </details>

        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Other / custom domain</summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs text-slate-600">
            <li>Log into whichever service manages email for this domain (hosting provider, Google Workspace admin, cPanel, etc.).</li>
            <li>Look for a &quot;Forwarding&quot; or &quot;Mail routing&quot; setting, usually under email or domain settings.</li>
            <li>
              Add a forwarding rule pointing to <span className="font-mono">{inboundAddress}</span>.
            </li>
            <li>If asked to verify domain ownership or confirm the destination address, follow that provider&apos;s prompt -- this step varies by host.</li>
          </ol>
        </details>
      </div>
    </div>
  );
}
