"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateClosure, deleteClosure } from "./actions";
import { utcToZonedWallDateTime } from "@/lib/timezone";

type Closure = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

// Stored starts_at/ends_at are UTC instants -- slicing the raw ISO string
// would show the admin's browser-local reading rather than the business's,
// which for a Lagos business viewed from anywhere else in the world would
// print the wrong wall-clock time into the datetime-local input.
function toDateTimeInput(iso: string, timeZone: string): string {
  return utcToZonedWallDateTime(iso, timeZone);
}

export function ClosureList({ closures, businessTimezone }: { closures: Closure[]; businessTimezone: string }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (closures.length === 0) {
    return <p className="mb-6 text-sm text-slate-500">No closures scheduled.</p>;
  }

  return (
    <ul className="mb-6 space-y-2">
      {closures.map((c) =>
        editingId === c.id ? (
          <EditClosureRow
            key={c.id}
            closure={c}
            businessTimezone={businessTimezone}
            onDone={() => {
              setEditingId(null);
              router.refresh();
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <li key={c.id} className="rounded border border-slate-200 bg-white p-3">
            <p className="text-sm">{c.reason ?? "Temporarily closed"}</p>
            <p className="mt-1 text-xs text-slate-400">
              {new Date(c.starts_at).toLocaleString(undefined, { timeZone: businessTimezone })} –{" "}
              {new Date(c.ends_at).toLocaleString(undefined, { timeZone: businessTimezone })}
            </p>
            <div className="mt-2 flex gap-3 text-xs">
              <button onClick={() => setEditingId(c.id)} className="text-accent hover:underline">
                Edit
              </button>
              <button
                onClick={async () => {
                  if (!confirm("Delete this closure? This can't be undone.")) return;
                  await deleteClosure(c.id);
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

function EditClosureRow({
  closure,
  businessTimezone,
  onDone,
  onCancel,
}: {
  closure: Closure;
  businessTimezone: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [startsAt, setStartsAt] = useState(toDateTimeInput(closure.starts_at, businessTimezone));
  const [endsAt, setEndsAt] = useState(toDateTimeInput(closure.ends_at, businessTimezone));
  const [reason, setReason] = useState(closure.reason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateClosure({ closureId: closure.id, startsAt, endsAt, reason });
    if (result?.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    onDone();
  }

  return (
    <li className="space-y-2 rounded border border-accent bg-white p-3">
      <div className="flex gap-2">
        <input type="datetime-local" className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        <input type="datetime-local" className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
      </div>
      <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
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
