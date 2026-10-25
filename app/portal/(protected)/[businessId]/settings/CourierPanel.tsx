"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { connectCourier, disconnectCourier } from "./courier-actions";

const PROVIDER = "shiip";

export function CourierPanel({
  businessId,
  connected,
  webhookUrl,
  canEdit,
}: {
  businessId: string;
  connected: boolean;
  webhookUrl: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (older browsers, insecure context). The URL
      // is also shown as selectable text, so this just stays un-copied.
    }
  }

  async function handleConnect() {
    setBusy(true);
    setError(null);
    const result = await connectCourier(businessId, PROVIDER, secret);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSecret("");
    router.refresh();
  }

  async function handleDisconnect() {
    if (
      !window.confirm(
        "Disconnect Shiip? Orders you've already linked will stop updating automatically until you reconnect.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await disconnectCourier(businessId, PROVIDER);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className="ui-card space-y-4">
      <div>
        <p className="ui-section-label !ml-0">Delivery tracking</p>
        <h2 className="mt-1 text-lg font-semibold">Update orders automatically when Shiip delivers them</h2>
        <p className="mt-1 text-sm text-slate-500">
          Connect your Shiip account and Mira marks an order delivered, and tells your customer, as soon as Shiip
          reports it. Mira doesn&apos;t book deliveries and never touches your Shiip wallet. You book in Shiip as
          usual, then add Shiip&apos;s reference to the order.
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-600">Your webhook address</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-slate-100/70 px-3 py-2 text-xs text-slate-700">
            {webhookUrl}
          </code>
          <button
            type="button"
            onClick={copyUrl}
            className="shrink-0 ui-btn ui-btn-secondary ui-btn-sm"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          This address is specific to your business. Add it as a webhook in your Shiip business dashboard.
        </p>
      </div>

      {connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm bg-green-50 px-3 py-2">
          <p className="text-sm text-green-800">Connected to Shiip.</p>
          {canEdit && (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={busy}
              className="text-sm font-medium text-slate-600 hover:underline disabled:opacity-50"
            >
              Disconnect
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label htmlFor="courier-secret" className="block text-sm font-medium text-slate-700">
              Shiip webhook secret
            </label>
            <p className="text-xs text-slate-500">
              Shiip gives you this when you add the address above. Mira uses it to check that updates really come
              from Shiip, and stores it encrypted.
            </p>
            <input
              id="courier-secret"
              type="password"
              autoComplete="off"
              value={secret}
              disabled={!canEdit || busy}
              onChange={(e) => setSecret(e.target.value)}
              className="ui-field mt-1 disabled:bg-slate-100"
            />
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={handleConnect}
              disabled={busy || !secret.trim()}
              className="ui-btn ui-btn-primary"
            >
              {busy ? "Connecting…" : "Connect Shiip"}
            </button>
          )}
        </div>
      )}

      {!canEdit && <p className="text-xs text-slate-500">Only the business owner can change this.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
