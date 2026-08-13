"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPolicy } from "./actions";

export function NewPolicyForm({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await createPolicy({ businessId, title, content });

    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    setTitle("");
    setContent("");
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Add a policy</h2>

      <input
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        placeholder="Title (e.g. 'Cancellation Policy')"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <textarea
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        placeholder="Content"
        rows={4}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        required
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add policy"}
      </button>
    </form>
  );
}
