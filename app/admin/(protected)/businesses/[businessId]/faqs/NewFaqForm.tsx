"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createFaq } from "./actions";

export function NewFaqForm({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await createFaq({ businessId, question, answer });

    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    setQuestion("");
    setAnswer("");
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Add an FAQ</h2>

      <input
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        placeholder="Question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        required
      />
      <textarea
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        placeholder="Answer — exactly what you want Mira to say"
        rows={3}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        required
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add FAQ"}
      </button>
    </form>
  );
}
