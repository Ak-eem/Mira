"use client";

import { useEffect, useMemo, useState } from "react";

type Draft = { id: string; kind: string; source_url: string; payload: Record<string, unknown>; status: "pending" | "approved" | "rejected" };
const LABELS: Record<string, string> = { product: "Products", service: "Services", policy: "Policies", faq: "FAQs", business_hours: "Business hours", image: "Images" };

export function WebsiteImport({ businessId }: { businessId: string }) {
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  async function loadDrafts() {
    const response = await fetch(`/api/portal/businesses/${businessId}/scrape`);
    if (response.ok) setDrafts((await response.json()).drafts ?? []);
  }

  // Genuine fetch-on-mount/fetch-on-businessId-change; there's no way to lazy-init an
  // async network request.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadDrafts(); }, [businessId]);

  async function importWebsite(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("Crawling the website and preparing a review draft...");
    const response = await fetch(`/api/portal/businesses/${businessId}/scrape`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ websiteUrl }) });
    const result = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) { setMessage(result.error ?? "Could not import that website."); return; }
    setDrafts(result.drafts ?? []);
    setMessage("Drafts are ready for your review. Nothing is live yet.");
  }

  async function review(draft: Draft, status: "approved" | "rejected") {
    const response = await fetch(`/api/portal/businesses/${businessId}/scrape`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId: draft.id, status }) });
    if (response.ok) await loadDrafts();
  }

  async function saveEdit(draft: Draft) {
    try {
      const payload = JSON.parse(editText) as Record<string, unknown>;
      const response = await fetch(`/api/portal/businesses/${businessId}/scrape`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId: draft.id, payload }) });
      if (response.ok) { setEditing(null); await loadDrafts(); }
    } catch { setMessage("Use valid JSON for the edited fields."); }
  }

  const groups = useMemo(() => Object.entries(Object.groupBy(drafts, (draft) => draft.kind)), [drafts]);
  return (
    <section className="glass-panel mt-8 rounded-xl p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Import from your website</h2>
        <p className="mt-1 text-sm text-slate-500">Mira will suggest products, services, policies, hours, FAQs, and images for you to review.</p>
      </div>
      <form onSubmit={importWebsite} className="flex flex-col gap-2 sm:flex-row">
        <input type="url" required value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://your-business.com" className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm" />
        <button disabled={loading} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{loading ? "Importing..." : "Find website information"}</button>
      </form>
      {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}
      {groups.length > 0 && <div className="mt-6 space-y-6">
        {groups.map(([kind, items]) => <div key={kind}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{LABELS[kind] ?? kind}</h3>
          <div className="space-y-3">{(items ?? []).map((draft) => <article key={draft.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1"><pre className="whitespace-pre-wrap break-words font-sans text-sm text-slate-800">{JSON.stringify(draft.payload, null, 2)}</pre><a href={draft.source_url} target="_blank" rel="noreferrer" className="mt-2 block truncate text-xs text-accent hover:underline">Source: {draft.source_url}</a></div>
              {draft.status === "pending" ? <div className="flex shrink-0 gap-2"><button onClick={() => { setEditing(draft.id); setEditText(JSON.stringify(draft.payload, null, 2)); }} className="rounded border border-slate-300 px-2 py-1 text-xs">Edit</button><button onClick={() => void review(draft, "approved")} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white">Approve</button><button onClick={() => void review(draft, "rejected")} className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-700">Reject</button></div> : <span className="text-xs font-medium capitalize text-slate-500">{draft.status}</span>}
            </div>
            {editing === draft.id && <div className="mt-3"><textarea value={editText} onChange={(event) => setEditText(event.target.value)} rows={5} className="w-full rounded border border-slate-300 p-2 font-mono text-xs" /><div className="mt-2 flex gap-2"><button onClick={() => void saveEdit(draft)} className="rounded bg-accent px-3 py-1 text-xs text-white">Save changes</button><button onClick={() => setEditing(null)} className="rounded border border-slate-300 px-3 py-1 text-xs">Cancel</button></div></div>}
          </article>)}</div>
        </div>)}
      </div>}
    </section>
  );
}
