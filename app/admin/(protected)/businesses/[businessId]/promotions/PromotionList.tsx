"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePromotion, deletePromotion } from "./actions";
import { utcToZonedWallDate } from "@/lib/timezone";

type Promotion = {
  id: string;
  description: string;
  service_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
};

// Stored starts_at/ends_at are UTC instants (e.g. Africa/Lagos midnight
// is 23:00 UTC the day before) -- slicing the raw ISO string for the
// date input would show the wrong calendar date. Convert into the
// business's own timezone instead.
function toDateInput(iso: string | null, timeZone: string): string {
  return iso ? utcToZonedWallDate(iso, timeZone) : "";
}

export function PromotionList({
  promotions,
  services,
  businessTimezone,
}: {
  promotions: Promotion[];
  services: { id: string; name: string }[];
  businessTimezone: string;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (promotions.length === 0) {
    return <p className="mb-6 text-sm text-slate-500">No promotions yet.</p>;
  }

  return (
    <ul className="mb-6 space-y-2">
      {promotions.map((p) =>
        editingId === p.id ? (
          <EditPromotionRow
            key={p.id}
            promotion={p}
            services={services}
            businessTimezone={businessTimezone}
            onDone={() => {
              setEditingId(null);
              router.refresh();
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <li key={p.id} className="rounded border border-slate-200 bg-white p-3">
            <p className="text-sm">{p.description}</p>
            <p className="mt-1 text-xs text-slate-400">
              {p.starts_at ? new Date(p.starts_at).toLocaleDateString(undefined, { timeZone: businessTimezone }) : "no start date"} –{" "}
              {p.ends_at ? new Date(p.ends_at).toLocaleDateString(undefined, { timeZone: businessTimezone }) : "no end date"}
              {!p.is_active && " · inactive"}
            </p>
            <div className="mt-2 flex gap-3 text-xs">
              <button onClick={() => setEditingId(p.id)} className="text-accent hover:underline">
                Edit
              </button>
              <button
                onClick={async () => {
                  if (!confirm("Delete this promotion? This can't be undone.")) return;
                  await deletePromotion(p.id);
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

function EditPromotionRow({
  promotion,
  services,
  businessTimezone,
  onDone,
  onCancel,
}: {
  promotion: Promotion;
  services: { id: string; name: string }[];
  businessTimezone: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState(promotion.description);
  const [serviceId, setServiceId] = useState(promotion.service_id ?? "");
  const [startsAt, setStartsAt] = useState(toDateInput(promotion.starts_at, businessTimezone));
  const [endsAt, setEndsAt] = useState(toDateInput(promotion.ends_at, businessTimezone));
  const [isActive, setIsActive] = useState(promotion.is_active);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updatePromotion({
      promotionId: promotion.id, description, serviceId, startsAt, endsAt, isActive,
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
      <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
      {services.length > 0 && (
        <select className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          <option value="">Applies to all services</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name} only</option>
          ))}
        </select>
      )}
      <div className="flex gap-2">
        <input type="date" className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        <input type="date" className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active
      </label>
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
