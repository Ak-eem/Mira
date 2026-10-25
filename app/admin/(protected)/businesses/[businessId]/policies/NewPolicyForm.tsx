"use client";

import { useSheetClose } from "@/components/ui/Sheet";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPolicy } from "./actions";

export function NewPolicyForm({ businessId }: { businessId: string }) {
  const closeSheet = useSheetClose();
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
    closeSheet();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      <div>
        <label htmlFor="f-title" className="ui-label">Title</label>
        <input id="f-title"
        className="ui-field" placeholder="e.g. 'Cancellation Policy'"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required />
      </div>
      <div>
        <label htmlFor="f-content" className="ui-label">Content</label>
        <textarea id="f-content"
        className="ui-field"
        rows={4}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        required />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className="ui-btn ui-btn-primary w-full"
      >
        {submitting ? "Adding…" : "Add policy"}
      </button>
    </form>
  );
}
