"use client";

import { useState, type FormEvent } from "react";

type TeamInviteFormProps = {
  businessId: string;
};

type InviteResponse = {
  error?: unknown;
  emailSent?: unknown;
};

export function TeamInviteForm({ businessId }: TeamInviteFormProps) {
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/team/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ businessId, email }),
      });
      const body = (await response.json().catch(() => null)) as InviteResponse | null;

      if (!response.ok) {
        const message = typeof body?.error === "string" ? body.error : "Unable to send invitation.";
        setFeedback({ kind: "error", text: message });
        return;
      }

      setEmail("");
      setFeedback({
        kind: "success",
        text: body?.emailSent === false
          ? "Invitation created, but the email could not be sent. Check email configuration before retrying."
          : "Invitation sent successfully.",
      });
    } catch {
      setFeedback({ kind: "error", text: "Unable to send invitation. Check your connection and try again." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitInvite} className="mt-3 flex flex-col gap-3 sm:flex-row">
      <input
        name="email"
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="teammate@example.com"
        aria-label="Teammate email address"
        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none ring-indigo-500 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2"
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Sending…" : "Send invite"}
      </button>
      {feedback ? (
        <p className={feedback.kind === "error" ? "text-sm text-rose-700 sm:basis-full" : "text-sm text-emerald-700 sm:basis-full"} role="status">
          {feedback.text}
        </p>
      ) : null}
    </form>
  );
}
