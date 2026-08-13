"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateService, deleteService } from "./actions";

type Service = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  is_available: boolean;
  availability_note: string | null;
};

export function ServiceList({ services, currency }: { services: Service[]; currency: string }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (services.length === 0) {
    return <p className="mb-6 text-sm text-slate-500">No services yet.</p>;
  }

  return (
    <ul className="mb-6 space-y-2">
      {services.map((s) =>
        editingId === s.id ? (
          <EditServiceRow
            key={s.id}
            service={s}
            onDone={() => {
              setEditingId(null);
              router.refresh();
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <li key={s.id} className="rounded border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">{s.name}</span>
              <span className="font-mono text-sm text-slate-500">
                {s.price != null ? `${currency} ${s.price}` : "Price on request"}
              </span>
            </div>
            {s.description && <p className="mt-1 text-sm text-slate-500">{s.description}</p>}
            {!s.is_available && (
              <p className="mt-1 text-xs text-amber-600">
                Unavailable{s.availability_note ? ` — ${s.availability_note}` : ""}
              </p>
            )}
            <div className="mt-2 flex gap-3 text-xs">
              <button onClick={() => setEditingId(s.id)} className="text-accent hover:underline">
                Edit
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Delete "${s.name}"? This can't be undone.`)) return;
                  await deleteService(s.id);
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

function EditServiceRow({
  service,
  onDone,
  onCancel,
}: {
  service: Service;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description ?? "");
  const [price, setPrice] = useState(service.price?.toString() ?? "");
  const [isAvailable, setIsAvailable] = useState(service.is_available);
  const [availabilityNote, setAvailabilityNote] = useState(service.availability_note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateService({
      serviceId: service.id, name, description, price, isAvailable, availabilityNote,
    });
    if (result?.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    onDone();
  }

  return (
    <li className="space-y-2 rounded border border-accent bg-white p-3">
      <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
      <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
      <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" inputMode="decimal" />
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} />
        Available
      </label>
      {!isAvailable && (
        <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={availabilityNote} onChange={(e) => setAvailabilityNote(e.target.value)} placeholder="Note" />
      )}
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
