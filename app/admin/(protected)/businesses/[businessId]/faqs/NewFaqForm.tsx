"use client";

import { useSheetClose } from "@/components/ui/Sheet";
import { useSnackbar } from "@/components/ui/Feedback";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createFaq } from "./actions";

export function NewFaqForm({ businessId }: { businessId: string }) {
  const closeSheet = useSheetClose();
  const snack = useSnackbar();
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
    snack({ message: "FAQ added" });
    closeSheet();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      <div>
        <label htmlFor="f-question" className="ui-label">Question</label>
        <input id="f-question"
        className="ui-field"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        required />
      </div>
      <div>
        <label htmlFor="f-answer-exactly-what-you-want-mira-to-say" className="ui-label">Answer — exactly what you want Mira to say</label>
        <textarea id="f-answer-exactly-what-you-want-mira-to-say"
        className="ui-field"
        rows={3}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        required />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className="ui-btn ui-btn-primary w-full"
      >
        {submitting ? "Adding…" : "Add FAQ"}
      </button>
    </form>
  );
}
