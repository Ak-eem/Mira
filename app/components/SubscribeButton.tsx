"use client";

import { useState } from "react";

type Props = { plan: "base"; businessId: string; businessName: string; email: string };

// Starts Paystack checkout. Paystack redirects back to /subscribe, which
// verifies the payment; the webhook remains the source of async activation.
export default function SubscribeButton({ plan, businessId, businessName, email }: Props) {
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function startCheckout() {
    setLoading(true);
    setStatus("Starting secure checkout…");
    try {
      const response = await fetch("/api/paystack/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, plan, business_id: businessId, business_name: businessName }),
      });
      const result = (await response.json()) as { authorization_url?: string; error?: string };
      if (!response.ok || !result.authorization_url) throw new Error(result.error ?? "Unable to start checkout");
      window.location.assign(result.authorization_url);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Unable to start checkout");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={startCheckout}
        disabled={loading}
        className="rounded bg-accent px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? "Opening Paystack…" : "Subscribe"}
      </button>
      {status ? <p role="status" className="mt-3 text-sm text-slate-600">{status}</p> : null}
    </div>
  );
}
