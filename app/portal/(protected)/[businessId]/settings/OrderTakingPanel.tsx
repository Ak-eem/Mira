"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SaveStatus } from "@/components/ui/SaveStatus";
import { useAutoSave } from "@/components/ui/useAutoSave";
import { saveOrderTaking } from "./actions";

export function OrderTakingPanel({ businessId, initialEnabled, canEdit }: { businessId: string; initialEnabled: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const { status, error, run } = useAutoSave((next: boolean) => saveOrderTaking(businessId, next), () => router.refresh());

  function change(next: boolean) {
    setEnabled(next);
    void run(next, () => setEnabled(!next));
  }

  return (
    <section>
      <p className="ui-section-label">Orders</p>
      <div className="ui-group">
        <label htmlFor="order-taking" className="ui-row justify-between">
          <span className="min-w-0">
            <span className="block text-[15px] font-medium text-slate-900">Let Mira take orders in chat</span>
            <span className="ui-hint mt-0.5 block">On for new businesses; turn it off if you would rather take orders yourself. When on, the customer sees an exact summary and must reply yes. The order then waits for your confirmation on the Orders page, and their chat is flagged for your team. Mira never takes payment.</span>
          </span>
          <input id="order-taking" type="checkbox" role="switch" className="ui-switch" checked={enabled} disabled={!canEdit} onChange={(e) => change(e.target.checked)} />
        </label>
      </div>
      <SaveStatus status={status} error={error} />
      <p className="ui-hint px-4">{canEdit ? "On for new businesses. Changes can take up to a minute to reach live chats." : "Only the business owner can change this."}</p>
    </section>
  );
}
