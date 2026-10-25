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

  if (services.length === 0) return null;

  return (
    <ul className="ui-group mb-6">
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
          <li key={s.id} className="ui-row flex-col items-stretch gap-1">
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
            <div className="mt-2 flex gap-2">
              <button onClick={() => setEditingId(s.id)} className="ui-btn ui-btn-plain ui-btn-sm">
                Edit
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Delete "${s.name}"? This can't be undone.`)) return;
                  await deleteService(s.id);
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
    <li className="ui-row flex-col items-stretch gap-3 bg-slate-50">
      <input className="ui-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
      <input className="ui-field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
      <input className="ui-field" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" inputMode="decimal" />
      <label className="ui-row justify-between rounded-xl bg-white shadow-[0_0_0_1px_rgb(15_42_34/0.06)]">
        <span className="text-[15px] font-medium text-slate-900">Available</span>
        <input type="checkbox" role="switch" className="ui-switch" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} />
      </label>
      {!isAvailable && (
        <input className="ui-field" value={availabilityNote} onChange={(e) => setAvailabilityNote(e.target.value)} placeholder="Note" />
      )}
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
