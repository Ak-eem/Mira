"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CANCEL_CONFIRMATION_WORD } from "@/lib/cancelSubscription";
import { cancelSubscription } from "./actions";

export function CancelSubscriptionPanel({ businessId, businessName }: { businessId: string; businessName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setWorking(true);
    setError(null);
    const result = await cancelSubscription(businessId, typed);
    if (result.error) {
      setWorking(false);
      setError(result.error);
      return;
    }
    // The portal no longer lets a cancelled business in, so go to the page that explains it.
    router.replace(`/portal/upgrade?businessId=${encodeURIComponent(businessId)}`);
  }

  return (
    <section className="space-y-4 rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-red-600">Cancel subscription</p>
        <h2 className="mt-1 text-lg font-semibold">Switch Mira off for {businessName}</h2>
        <p className="mt-1 text-sm text-slate-500">
          Cancelling takes effect <strong>immediately</strong>, with no waiting period:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-500">
          <li>The chat widget disappears from your website.</li>
          <li>Mira stops replying on WhatsApp and email.</li>
          <li>Fees already paid are not refunded.</li>
          <li>Your data is kept for 30 days in case you come back; after that it can be deleted.</li>
        </ul>
      </div>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Cancel subscription…
        </button>
      ) : (
        <div className="space-y-3 rounded-lg bg-red-50 p-4">
          <label className="block text-sm text-slate-700">
            Type <strong>{CANCEL_CONFIRMATION_WORD}</strong> to confirm
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={working || typed.trim() !== CANCEL_CONFIRMATION_WORD}
              className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {working ? "Cancelling…" : "Cancel subscription now"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
              disabled={working}
              className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Keep my subscription
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
