"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteBusiness } from "./delete-actions";

export function DeleteBusinessPanel({ businessId, businessName }: { businessId: string; businessName: string }) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = confirmText.trim() === businessName;

  async function handleDelete() {
    if (!matches) return;
    setDeleting(true);
    setError(null);

    const result = await deleteBusiness(businessId, confirmText);

    if (result.error) {
      setError(result.error);
      setDeleting(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-3">
      <p className="mb-1 text-sm font-medium text-red-800">Delete this business</p>
      <p className="mb-3 text-sm text-red-700">
        Permanent. Deletes every conversation, message, order, product, nudge rule, and portal login tied to{" "}
        <span className="font-medium">{businessName}</span> — there's no undo.
      </p>

      <label className="block text-xs font-medium text-red-800">
        Type <span className="font-mono">{businessName}</span> to confirm
      </label>
      <input
        className="mt-1 w-full rounded border border-red-300 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
      />

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      <button
        onClick={handleDelete}
        disabled={!matches || deleting}
        className="mt-3 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {deleting ? "Deleting…" : "Delete business permanently"}
      </button>
    </div>
  );
}
