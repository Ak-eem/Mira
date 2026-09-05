"use client";

import { useActionState, useEffect, useRef } from "react";
import { replyToConversation } from "../actions";

type ReplyState = { error?: string; success?: boolean };

export function ReplyForm({
  businessId,
  conversationId,
}: {
  businessId: string;
  conversationId: string;
}) {
  async function action(_prev: ReplyState, formData: FormData): Promise<ReplyState> {
    const text = (formData.get("reply") as string) ?? "";
    const result = await replyToConversation(businessId, conversationId, text);
    if (result.error) return { error: result.error };
    return { success: true };
  }

  const [state, formAction, pending] = useActionState<ReplyState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="mt-6 flex flex-col gap-2">
      <textarea
        name="reply"
        rows={3}
        required
        placeholder="Type a reply to send to the customer…"
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-accent focus:outline-none"
      />
      <div className="flex items-center justify-between gap-3">
        {state.error ? (
          <p className="text-xs text-red-600">{state.error}</p>
        ) : (
          <span className="text-xs text-slate-400">
            Sends immediately — for WhatsApp conversations, straight to the customer's phone.
          </span>
        )}
        <button
          type="submit"
          disabled={pending}
          className="flex-shrink-0 rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white shadow-sm disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send reply"}
        </button>
      </div>
    </form>
  );
}
