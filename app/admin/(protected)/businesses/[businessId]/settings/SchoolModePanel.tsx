"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setBusinessType } from "./school-actions";

export function SchoolModePanel({ businessId, isSchool }: { businessId: string; isSchool: boolean }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setWorking(true);
    setError(null);
    const result = await setBusinessType({ businessId, businessType: isSchool ? "general" : "school" });
    setWorking(false);
    if (result.error) { setError(result.error); return; }
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      <div>
        <h2 className="text-lg font-semibold">School mode</h2>
        <p className="mt-1 text-sm text-slate-500">
          {isSchool
            ? "On. The owner sees a School page (sessions, terms, classes, fees, students) and Mira answers from it. Turning this off keeps the data but stops using it."
            : "Off. Turn on for a school so the owner gets a School page and Mira can answer questions about terms, classes and fees."}
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="button" onClick={toggle} disabled={working} className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50">
        {working ? "Saving…" : isSchool ? "Turn off school mode" : "Turn on school mode"}
      </button>
    </section>
  );
}
