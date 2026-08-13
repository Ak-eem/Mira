"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePolicy, deletePolicy } from "./actions";

type Policy = { id: string; title: string; content: string };

export function PolicyList({ policies }: { policies: Policy[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (policies.length === 0) {
    return <p className="mb-6 text-sm text-slate-500">No policies yet.</p>;
  }

  return (
    <ul className="mb-6 space-y-2">
      {policies.map((p) =>
        editingId === p.id ? (
          <EditPolicyRow
            key={p.id}
            policy={p}
            onDone={() => {
              setEditingId(null);
              router.refresh();
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <li key={p.id} className="rounded border border-slate-200 bg-white p-3">
            <p className="text-sm font-medium">{p.title}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{p.content}</p>
            <div className="mt-2 flex gap-3 text-xs">
              <button onClick={() => setEditingId(p.id)} className="text-accent hover:underline">
                Edit
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Delete "${p.title}"? This can't be undone.`)) return;
                  await deletePolicy(p.id);
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

function EditPolicyRow({
  policy,
  onDone,
  onCancel,
}: {
  policy: Policy;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(policy.title);
  const [content, setContent] = useState(policy.content);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updatePolicy({ policyId: policy.id, title, content });
    if (result?.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    onDone();
  }

  return (
    <li className="space-y-2 rounded border border-accent bg-white p-3">
      <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
      <textarea className="w-full rounded border border-slate-300 px-2 py-1 text-sm" rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Content" />
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
