"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { summarizeDraft } from "@/lib/scrape/summarizeDraft";
import { computeSelection, toggleAllUnticked, confirmLabel } from "@/lib/scrape/selection";

type Draft = { id: string; kind: string; source_url: string; payload: Record<string, unknown>; status: "pending" | "approved" | "rejected" };
type ReviewSummary = { approved: number; rejected: number; failed: number; imagesFailed: number };

const LABELS: Record<string, string> = { product: "Products", service: "Services", policy: "Policies", faq: "FAQs", business_hours: "Business hours", image: "Images" };

function resultMessage(s: ReviewSummary): string {
  const parts = [`Added ${s.approved}`, `discarded ${s.rejected}`];
  let message = `${parts.join(", ")}.`;
  if (s.imagesFailed > 0) message += ` ${s.imagesFailed} product photo${s.imagesFailed === 1 ? "" : "s"} couldn't be imported; you can upload ${s.imagesFailed === 1 ? "it" : "them"} yourself.`;
  if (s.failed > 0) message += ` ${s.failed} couldn't be processed and ${s.failed === 1 ? "is" : "are"} still listed; try again.`;
  return message;
}

export function WebsiteImport({
  businessId,
  embedded = false,
  onReviewed,
}: {
  businessId: string;
  // Inside the signup wizard the surrounding card already provides the frame.
  embedded?: boolean;
  onReviewed?: (summary: ReviewSummary) => void;
}) {
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  // Tracked as the items the owner UNticked, so everything starts selected
  // and newly arriving drafts are ticked by default.
  const [unticked, setUnticked] = useState<Set<string>>(new Set());

  const loadDrafts = useCallback(async () => {
    const response = await fetch(`/api/portal/businesses/${businessId}/scrape`);
    if (response.ok) setDrafts((await response.json()).drafts ?? []);
  }, [businessId]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/portal/businesses/${businessId}/scrape`)
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setDrafts(data.drafts ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const pending = useMemo(() => drafts.filter((d) => d.status === "pending"), [drafts]);
  const reviewedCount = drafts.length - pending.length;
  const pendingIds = useMemo(() => pending.map((d) => d.id), [pending]);
  const selection = useMemo(() => computeSelection(pendingIds, unticked), [pendingIds, unticked]);
  const { approveIds: selectedIds, discardIds, allSelected } = selection;
  const groups = useMemo(() => Object.entries(Object.groupBy(pending, (draft) => draft.kind)), [pending]);

  async function importWebsite(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("Crawling the website and preparing a review draft...");
    const response = await fetch(`/api/portal/businesses/${businessId}/scrape`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ websiteUrl }) });
    const result = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setMessage(result.error ?? "Could not import that website.");
      return;
    }
    await loadDrafts();
    setUnticked(new Set());
    setMessage(
      (result.drafts ?? []).length > 0
        ? "Here's what we found. Untick anything that's wrong, then add the rest. Nothing is live yet."
        : "We couldn't find anything we could use on that site.",
    );
  }

  function toggle(id: string) {
    setUnticked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setUnticked(toggleAllUnticked(pendingIds, allSelected));
  }

  async function confirm() {
    if (selectedIds.length === 0 && !window.confirm(`Discard all ${discardIds.length} suggestions? Nothing will be added.`)) return;
    setConfirming(true);
    setMessage(null);
    const response = await fetch(`/api/portal/businesses/${businessId}/scrape/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approveIds: selectedIds, rejectIds: discardIds }),
    });
    const result = await response.json().catch(() => ({}));
    setConfirming(false);
    if (!response.ok) {
      setMessage(result.error ?? "Couldn't save your review. Please try again.");
      return;
    }
    setMessage(resultMessage(result.summary));
    setUnticked(new Set());
    await loadDrafts();
    onReviewed?.(result.summary);
  }

  async function saveEdit(draft: Draft) {
    try {
      const payload = JSON.parse(editText) as Record<string, unknown>;
      const response = await fetch(`/api/portal/businesses/${businessId}/scrape`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId: draft.id, payload }) });
      if (response.ok) {
        setEditing(null);
        await loadDrafts();
      }
    } catch {
      setMessage("Use valid JSON for the edited fields.");
    }
  }

  return (
    <section className={embedded ? "" : "glass-panel mt-8 rounded-xl p-5"}>
      {!embedded && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Import from your website</h2>
          <p className="mt-1 text-sm text-slate-500">Mira will suggest products, services, policies, hours, FAQs, and images for you to review.</p>
        </div>
      )}
      <form onSubmit={importWebsite} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          required
          value={websiteUrl}
          onChange={(event) => setWebsiteUrl(event.target.value)}
          placeholder="https://your-business.com"
          aria-label="Your website address"
          className="min-w-0 flex-1 ui-field"
        />
        <button disabled={loading} className="ui-btn ui-btn-primary">
          {loading ? "Importing..." : "Find website information"}
        </button>
      </form>
      {message && (
        <p role="status" className="mt-3 text-sm text-slate-600">
          {message}
        </p>
      )}

      {pending.length > 0 && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <button type="button" onClick={toggleAll} className="text-sm font-medium text-accent hover:underline">
              {allSelected ? "Unselect all" : "Select all"}
            </button>
            <p className="text-xs text-slate-500">
              {selectedIds.length} of {pending.length} selected. Unticked items are discarded.
            </p>
          </div>

          <div className="mt-4 space-y-6">
            {groups.map(([kind, items]) => (
              <div key={kind}>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{LABELS[kind] ?? kind}</h3>
                <ul className="space-y-2">
                  {(items ?? []).map((draft) => {
                    const summary = summarizeDraft(draft.kind, draft.payload);
                    const ticked = !unticked.has(draft.id);
                    return (
                      <li key={draft.id} className={`rounded-lg border bg-white p-3 ${ticked ? "border-slate-200" : "border-slate-200 opacity-60"}`}>
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={ticked}
                            onChange={() => toggle(draft.id)}
                            aria-label={`Include: ${summary.title}`}
                            className="mt-1 h-4 w-4 shrink-0 accent-indigo-600"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900">{summary.title}</p>
                            {summary.detail && <p className="mt-0.5 text-xs text-slate-500">{summary.detail}</p>}
                            <details className="mt-1">
                              <summary className="cursor-pointer text-xs text-slate-500">Details</summary>
                              <pre className="mt-1 whitespace-pre-wrap wrap-break-word font-sans text-xs text-slate-700">{JSON.stringify(draft.payload, null, 2)}</pre>
                              <a href={draft.source_url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-accent hover:underline">
                                Source: {draft.source_url}
                              </a>
                            </details>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(draft.id);
                              setEditText(JSON.stringify(draft.payload, null, 2));
                            }}
                            className="shrink-0 ui-btn ui-btn-secondary ui-btn-sm"
                          >
                            Edit
                          </button>
                        </div>
                        {editing === draft.id && (
                          <div className="mt-3">
                            <textarea value={editText} onChange={(event) => setEditText(event.target.value)} rows={5} aria-label="Edit details as JSON" className="ui-field font-mono !text-xs" />
                            <div className="mt-2 flex gap-2">
                              <button type="button" onClick={() => void saveEdit(draft)} className="ui-btn ui-btn-primary ui-btn-sm">
                                Save changes
                              </button>
                              <button type="button" onClick={() => setEditing(null)} className="ui-btn ui-btn-secondary ui-btn-sm">
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          <div className="sticky bottom-0 mt-4 flex justify-end border-t border-slate-200 bg-canvas/90 py-3 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={confirming}
              className="ui-btn ui-btn-primary"
            >
              {confirmLabel(selection, confirming)}
            </button>
          </div>
        </div>
      )}

      {pending.length === 0 && reviewedCount > 0 && (
        <p className="mt-4 text-xs text-slate-500">
          {reviewedCount} earlier suggestion{reviewedCount === 1 ? "" : "s"} already reviewed.
        </p>
      )}
    </section>
  );
}
