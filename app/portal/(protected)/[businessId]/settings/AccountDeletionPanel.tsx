"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DELETE_REQUEST_WORD } from "@/lib/deletionRequest";
import { requestAccountDeletion } from "./actions";

export function AccountDeletionPanel({ businessId, businessName, requestedOn }: { businessId: string; businessName: string; requestedOn: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setWorking(true);
    setError(null);
    const result = await requestAccountDeletion(businessId, typed);
    setWorking(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDone(true);
    setOpen(false);
    router.refresh();
  }

  const requested = Boolean(requestedOn) || done;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delete account</p>
        <h2 className="mt-1 text-lg font-semibold">Ask us to delete {businessName} and its data</h2>
        <p className="mt-1 text-sm text-slate-500">
          This sends a request to Mira&apos;s team. <strong>Nothing is deleted straight away.</strong> We&apos;ll confirm with you by email first,
          and a person carries out the deletion, so it isn&apos;t instant. Deleting removes your knowledge data, products, orders and chat
          histories permanently. This is separate from cancelling your subscription. See our{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>{" "}
          for how data is kept.
        </p>
      </div>

      {requested ? (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          Deletion requested{requestedOn ? ` on ${requestedOn}` : ""}. We&apos;ll email you to confirm before anything is deleted.
        </p>
      ) : !open ? (
        <button type="button" onClick={() => setOpen(true)} className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Request account deletion…
        </button>
      ) : (
        <div className="space-y-3 rounded-lg bg-slate-50 p-4">
          <label className="block text-sm text-slate-700">
            Type <strong>{DELETE_REQUEST_WORD}</strong> to send the request
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={working || typed.trim() !== DELETE_REQUEST_WORD}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {working ? "Sending…" : "Send deletion request"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
              disabled={working}
              className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Never mind
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
