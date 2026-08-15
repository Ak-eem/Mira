"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inviteBusinessOwner, removeBusinessOwner } from "./owners-actions";

type Owner = { id: string; email: string };

export function OwnersPanel({ businessId, owners }: { businessId: string; owners: Owner[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await inviteBusinessOwner(businessId, email);

    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEmail("");
    router.refresh();
  }

  async function handleRemove(ownerRowId: string) {
    await removeBusinessOwner(businessId, ownerRowId);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="mb-3 text-sm font-medium text-slate-700">
        Portal access <span className="font-normal text-slate-400">— who can log into the business portal</span>
      </p>

      {owners.length > 0 && (
        <ul className="mb-3 space-y-1">
          {owners.map((owner) => (
            <li key={owner.id} className="flex items-center justify-between text-sm">
              <span>{owner.email}</span>
              <button
                type="button"
                onClick={() => handleRemove(owner.id)}
                className="text-xs text-slate-400 hover:text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleInvite} className="flex gap-2">
        <input
          type="email"
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          placeholder="owner@business.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
        >
          {submitting ? "Inviting…" : "Invite"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-slate-400">
        Sends a Supabase invite email so they can set their own password.
      </p>
    </div>
  );
}
