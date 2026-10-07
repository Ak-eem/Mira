"use client";

import { useState } from "react";
import { clearReplyReview, saveReplyReview } from "../actions";
import {
  CUSTOMER_REASON_LABELS,
  FEEDBACK_REASONS,
  MAX_FEEDBACK_NOTE_LENGTH,
  STAFF_REASON_HINTS,
  STAFF_REASON_LABELS,
  isFeedbackReason,
  type FeedbackReason,
} from "@/lib/feedback/reasons";

type CustomerFeedback = { rating: "up" | "down"; reason: string | null };
type StaffReview = { rating: "up" | "down"; reason: string | null; note: string | null };

export function ReplyReview({
  businessId,
  conversationId,
  messageId,
  customer,
  staff,
}: {
  businessId: string;
  conversationId: string;
  messageId: string;
  customer: CustomerFeedback | null;
  staff: StaffReview | null;
}) {
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setRating(staff?.rating ?? null);
    setReason(isFeedbackReason(staff?.reason) ? staff.reason : null);
    setNote(staff?.note ?? "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (!rating) return;
    setSaving(true);
    setError(null);
    const result = await saveReplyReview({
      businessId,
      conversationId,
      messageId,
      rating,
      reason: rating === "down" ? reason : null,
      note: rating === "down" ? note : null,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditing(false);
  }

  async function clear() {
    setSaving(true);
    setError(null);
    const result = await clearReplyReview({ businessId, conversationId, messageId });
    setSaving(false);
    if (result.error) setError(result.error);
  }

  const customerReason = isFeedbackReason(customer?.reason) ? CUSTOMER_REASON_LABELS[customer.reason] : null;
  const staffReason = isFeedbackReason(staff?.reason) ? STAFF_REASON_LABELS[staff.reason] : null;

  return (
    <div className="mt-1 space-y-1 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-400">
        {customer && (
          <span className={customer.rating === "down" ? "text-red-500" : "text-emerald-600"}>
            Customer: {customer.rating === "down" ? "👎" : "👍"}
            {customerReason ? ` ${customerReason}` : ""}
          </span>
        )}

        {staff && !editing && (
          <span className={staff.rating === "down" ? "text-red-500" : "text-emerald-600"}>
            You: {staff.rating === "down" ? "Needs work" : "Good reply"}
            {staffReason ? ` · ${staffReason}` : ""}
          </span>
        )}

        {!editing && (
          <>
            <button type="button" onClick={startEditing} className="text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline">
              {staff ? "Change review" : "Review reply"}
            </button>
            {staff && (
              <button type="button" disabled={saving} onClick={clear} className="text-slate-400 hover:text-red-600 disabled:opacity-50">
                Clear
              </button>
            )}
          </>
        )}
      </div>

      {!editing && staff?.note && <p className="text-slate-500">Your note: {staff.note}</p>}

      {editing && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRating("up")}
              className={`rounded-sm border px-2.5 py-1 ${rating === "up" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-600"}`}
            >
              Good reply
            </button>
            <button
              type="button"
              onClick={() => setRating("down")}
              className={`rounded-sm border px-2.5 py-1 ${rating === "down" ? "border-red-400 bg-red-50 text-red-600" : "border-slate-300 text-slate-600"}`}
            >
              Needs work
            </button>
          </div>

          {rating === "down" && (
            <>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="What was wrong?">
                {FEEDBACK_REASONS.map((code) => (
                  <button
                    key={code}
                    type="button"
                    title={STAFF_REASON_HINTS[code]}
                    onClick={() => setReason(code)}
                    className={`rounded-full border px-2.5 py-0.5 ${reason === code ? "border-slate-700 bg-slate-700 text-white" : "border-slate-300 text-slate-600"}`}
                  >
                    {STAFF_REASON_LABELS[code]}
                  </button>
                ))}
              </div>
              {reason && <p className="text-slate-400">{STAFF_REASON_HINTS[reason]}</p>}
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={MAX_FEEDBACK_NOTE_LENGTH}
                rows={2}
                placeholder="Optional note: what should it have said?"
                className="w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm"
              />
            </>
          )}

          {error && <p className="text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving || !rating || (rating === "down" && !reason)}
              onClick={save}
              className="rounded-sm bg-accent px-3 py-1 font-medium text-white hover:bg-accent-dark disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save review"}
            </button>
            <button type="button" disabled={saving} onClick={() => setEditing(false)} className="px-2 py-1 text-slate-500 hover:text-slate-800">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
