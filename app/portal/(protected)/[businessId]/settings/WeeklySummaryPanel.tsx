"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SaveStatus } from "@/components/ui/SaveStatus";
import { useAutoSave } from "@/components/ui/useAutoSave";
import { saveWeeklySummary } from "./actions";

// This owner's own switch: it never changes anyone else's email.
export function WeeklySummaryPanel({ businessId, initialEnabled }: { businessId: string; initialEnabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const { status, error, run } = useAutoSave((next: boolean) => saveWeeklySummary(businessId, next), () => router.refresh());

  function change(next: boolean) {
    setEnabled(next);
    void run(next, () => setEnabled(!next));
  }

  return (
    <section>
      <p className="ui-section-label">Email</p>
      <div className="ui-group">
        <label htmlFor="weekly-summary" className="ui-row justify-between">
          <span className="min-w-0">
            <span className="block text-[15px] font-medium text-slate-900">Weekly summary</span>
            <span className="ui-hint mt-0.5 block">
              A short email on Monday morning: how many customers chatted, how many orders Mira took and what they were worth, and who is waiting for you. Weeks with no activity send nothing.
            </span>
          </span>
          <input id="weekly-summary" type="checkbox" role="switch" className="ui-switch" checked={enabled} onChange={(e) => change(e.target.checked)} />
        </label>
      </div>
      <SaveStatus status={status} error={error} />
      <p className="ui-hint px-4">This only affects your own email address.</p>
    </section>
  );
}
