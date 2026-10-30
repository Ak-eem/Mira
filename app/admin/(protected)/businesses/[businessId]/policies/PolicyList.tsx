"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePolicy, deletePolicy } from "./actions";
import { useConfirm, useSnackbar } from "@/components/ui/Feedback";

type Policy = { id: string; title: string; content: string };

export function PolicyList({ policies }: { policies: Policy[] }) {
  const confirm = useConfirm();
  const snack = useSnackbar();
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (policies.length === 0) return null;

  return (
    <ul className="ui-group mb-6">
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
          <li key={p.id} className="ui-row flex-col items-stretch gap-1">
            <p className="text-sm font-medium">{p.title}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{p.content}</p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => setEditingId(p.id)} className="ui-btn ui-btn-plain ui-btn-sm">
                Edit
              </button>
              <button
                onClick={async () => {
                  const ok = await confirm({ title: `Delete "${p.title}"?`, description: "This can't be undone.", destructive: true, confirmLabel: "Delete" });
                    if (!ok) return;
                  await deletePolicy(p.id);
                  snack({ message: "Deleted" });
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
    <li className="ui-row flex-col items-stretch gap-3 bg-slate-50">
      <input className="ui-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
      <textarea className="ui-field" rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Content" />
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
