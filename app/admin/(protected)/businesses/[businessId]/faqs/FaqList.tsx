"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateFaq, deleteFaq } from "./actions";

type Faq = { id: string; question: string; answer: string };

export function FaqList({ faqs }: { faqs: Faq[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (faqs.length === 0) return null;

  return (
    <ul className="ui-group mb-6">
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
          <li key={f.id} className="ui-row flex-col items-stretch gap-1">
            <p className="text-sm font-medium">{f.question}</p>
            <p className="mt-1 text-sm text-slate-500">{f.answer}</p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => setEditingId(f.id)} className="ui-btn ui-btn-plain ui-btn-sm">
                Edit
              </button>
              <button
                onClick={async () => {
                  if (!confirm("Delete this FAQ? This can't be undone.")) return;
                  await deleteFaq(f.id);
                  router.refresh();
                }}
                className="ui-btn ui-btn-danger ui-btn-sm"
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
    <li className="ui-row flex-col items-stretch gap-3 bg-slate-50">
      <input className="ui-field" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question" />
      <textarea className="ui-field" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer" />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="ui-btn ui-btn-primary ui-btn-sm">
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} className="ui-btn ui-btn-secondary ui-btn-sm">
          Cancel
        </button>
      </div>
    </li>
  );
}
