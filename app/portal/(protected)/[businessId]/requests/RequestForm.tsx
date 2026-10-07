"use client";

import { useState } from "react";

const CATEGORIES = ["New feature", "Change to my assistant", "Integration", "Something else"];

export function RequestForm({ businessId }: { businessId: string }) {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/custom-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, category, title, details }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not send your request.");
      setSent(true);
      setTitle("");
      setDetails("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your request.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
        <p className="font-medium text-slate-900">Request sent.</p>
        <p className="mt-1">We will reply to your account email.</p>
        <button type="button" onClick={() => setSent(false)} className="mt-3 text-accent underline">
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">
      <label className="flex flex-col gap-1.5 text-sm text-slate-600">
        What kind of request?
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-slate-900">
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-slate-600">
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required className="rounded-lg border border-slate-200 px-3 py-2 text-slate-900" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-slate-600">
        Details
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={4000} required rows={6} className="resize-y rounded-lg border border-slate-200 px-3 py-2 text-slate-900" />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={sending} className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
        {sending ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
