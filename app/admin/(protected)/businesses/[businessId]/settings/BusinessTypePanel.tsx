"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminSelect } from "@/components/ui/AdminSelect";
import { ALL_BUSINESS_TYPES, type BusinessType } from "@/lib/businessTypes";
import { setBusinessType } from "./school-actions";

const HINTS: Record<BusinessType, string> = {
  general: "The default. Mira answers from the business's own details.",
  tech_store: "Tunes Mira for phones, laptops and gadgets: tech-savvy, careful about specs, condition and warranty, and it can look up current specs on the web. Price and stock still come only from the product list.",
  school: "The owner gets a School page (sessions, terms, classes, fees, students) and Mira answers from it. Switching away keeps the data but stops using it.",
};

export function BusinessTypePanel({ businessId, businessType }: { businessId: string; businessType: string }) {
  const router = useRouter();
  const current = (ALL_BUSINESS_TYPES.some((t) => t.value === businessType) ? businessType : "general") as BusinessType;
  const [value, setValue] = useState<BusinessType>(current);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: string) {
    const previous = value;
    setValue(next as BusinessType);
    setWorking(true);
    setError(null);
    const result = await setBusinessType({ businessId, businessType: next as BusinessType });
    setWorking(false);
    if (result.error) {
      setValue(previous);
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className="glass-panel space-y-3 rounded-[18px] p-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">Business type</h2>
        <p className="mt-1 text-sm text-muted">{HINTS[value]}</p>
      </div>
      <AdminSelect
        ariaLabel="Business type"
        size="lg"
        menuWidth={220}
        value={value}
        disabled={working}
        onChange={change}
        options={ALL_BUSINESS_TYPES.map((t) => ({ value: t.value, label: t.label }))}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}
