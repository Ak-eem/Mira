"use client";

import { useState, useTransition } from "react";
import { enableEmailAddress } from "@/lib/email/inboundAddressActions";

export function EnableEmailAddress({ businessId }: { businessId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        className="ui-btn ui-btn-primary"
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await enableEmailAddress(businessId);
            if (result.error) setError(result.error);
          })
        }
      >
        {pending ? "Setting up…" : "Get my Mira email address"}
      </button>
      {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}
