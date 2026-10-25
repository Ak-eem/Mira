"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Segmented } from "@/components/ui/Segmented";
import { SaveStatus } from "@/components/ui/SaveStatus";
import { useAutoSave } from "@/components/ui/useAutoSave";
import { saveGroundingSettings } from "./actions";

type Level = "low" | "medium";

export function GroundingPanel({ businessId, initialLevel, initialEscalate, canEdit }: { businessId: string; initialLevel: Level; initialEscalate: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [level, setLevel] = useState<Level>(initialLevel);
  const [escalate, setEscalate] = useState(initialEscalate);
  const { status, error, run } = useAutoSave((next: { level: Level; escalate: boolean }) => saveGroundingSettings(businessId, next.level, next.escalate), () => router.refresh());

  function changeLevel(next: Level) {
    const previous = level;
    setLevel(next);
    void run({ level: next, escalate }, () => setLevel(previous));
  }
  function changeEscalate(next: boolean) {
    setEscalate(next);
    void run({ level, escalate: next }, () => setEscalate(!next));
  }

  return (
    <section>
      <p className="ui-section-label">Answer check</p>
      <div className="ui-card space-y-4">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">Flag replies that don&apos;t match your business info</h2>
          <p className="ui-hint mt-1">After each reply, Mira compares the prices, opening times, links, contact details and policies it mentioned with what you&apos;ve told her. Replies that don&apos;t match appear on the Review page. Customers never see this. It can&apos;t catch every mistake, only ones involving those facts.</p>
        </div>
        <div>
          <p className="ui-label">What goes on the Review page</p>
          <div className={canEdit ? "" : "pointer-events-none opacity-60"}>
            <Segmented label="Review level" value={level} onChange={changeLevel} options={[{ value: "low", label: "Clear mismatches" }, { value: "medium", label: "Also policy claims" }]} />
          </div>
          <p className="ui-hint mt-2">{level === "low" ? "A price, time, link or contact that isn\u2019t in your info." : "Also claims about delivery, refunds or other policies you haven\u2019t described."}</p>
        </div>
      </div>
      <div className="ui-group mt-3">
        <label htmlFor="grounding-escalate" className="ui-row justify-between">
          <span className="min-w-0">
            <span className="block text-[15px] font-medium text-slate-900">Hand the chat to my team after two weak replies in a row</span>
            <span className="ui-hint mt-0.5 block">A single weak reply never interrupts a customer; this only steps in when it repeats.</span>
          </span>
          <input id="grounding-escalate" type="checkbox" role="switch" className="ui-switch" checked={escalate} disabled={!canEdit} onChange={(e) => changeEscalate(e.target.checked)} />
        </label>
      </div>
      <SaveStatus status={status} error={error} />
      {!canEdit && <p className="ui-hint px-4">Only the business owner can change this.</p>}
    </section>
  );
}
