"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateFaq, deleteFaq } from "./actions";

type Faq = { id: string; question: string; answer: string };

export function FaqList({ faqs }: { faqs: Faq[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (faqs.length === 0) {
    return <p className="mb-6 text-sm text-slate-500">No FAQs yet.</p>;
  }

  return (
    <ul className="mb-6 space-y-2">
      {faqs.map((f) =>
        editingId === f.id ? (
          <EditFaqRow
            key={f.id}
            faq={f}
            onDone={() => {
              setEditingId(null);
              router.refresh();
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <li key={f.id} className="rounded border border-slate-200 bg-white p-3">
            <p className="text-sm font-medium">{f.question}</p>
            <p className="mt-1 text-sm text-slate-500">{f.answer}</p>
            <div className="mt-2 flex gap-3 text-xs">
              <button onClick={() => setEditingId(f.id)} className="text-accent hover:underline">
                Edit
              </button>
              <button
                onClick={async () => {
                  if (!confirm("Delete this FAQ? This can't be undone.")) return;
                  await deleteFaq(f.id);
                  router.refresh();
                }}
                className="text-red-600 hover:underline"
              >
                Delete
              </button>
            </div>
          </li>
        )
      )}
    </ul>
  );
}

function EditFaqRow({
  faq,
  onDone,
  onCancel,
}: {
  faq: Faq;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [question, setQuestion] = useState(faq.question);
  const [answer, setAnswer] = useState(faq.answer);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateFaq({ faqId: faq.id, question, answer });
    if (result?.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    onDone();
  }

  return (
    <li className="space-y-2 rounded border border-accent bg-white p-3">
      <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question" />
      <textarea className="w-full rounded border border-slate-300 px-2 py-1 text-sm" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer" />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="rounded bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} className="rounded border border-slate-300 px-3 py-1 text-xs">
          Cancel
        </button>
      </div>
    </li>
  );
}
