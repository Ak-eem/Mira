"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { savePromptDraft, promotePromptRelease } from "./actions";
import { diffLines, type DiffLine } from "@/lib/diffLines";
import type { PromptRelease } from "@/lib/promptReleases";

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function DiffBlock({ label, before, after }: { label: string; before: string; after: string }) {
  const lines = useMemo(() => diffLines(before, after), [before, after]);
  const hasChanges = lines.some((l: DiffLine) => l.type !== "same");
  if (!hasChanges) return null;

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
        {label}
      </div>
      <div className="space-y-0.5 p-3 font-mono text-xs">
        {lines.map((line: DiffLine, i: number) => (
          <div
            key={i}
            className={
              line.type === "added"
                ? "bg-emerald-50 text-emerald-800"
                : line.type === "removed"
                  ? "bg-rose-50 text-rose-700 line-through"
                  : "text-slate-500"
            }
          >
            {line.type === "added" ? "+ " : line.type === "removed" ? "- " : "  "}
            {line.text || " "}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PromptEditor({
  businessId,
  initialDraft,
  active,
  history,
}: {
  businessId: string;
  initialDraft: PromptRelease | null;
  active: PromptRelease | null;
  history: PromptRelease[];
}) {
  const router = useRouter();
  const seed = initialDraft ?? active;
  const [draft, setDraft] = useState(initialDraft);
  const [aiTone, setAiTone] = useState(seed?.ai_tone ?? "");
  const [aiInstructions, setAiInstructions] = useState(seed?.ai_instructions ?? "");
  const [note, setNote] = useState(initialDraft?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);

  const draftMatchesActive = useMemo(() => {
    if (!draft) return false;
    const before = `${active?.ai_tone ?? ""}\n${active?.ai_instructions ?? ""}`;
    const after = `${draft.ai_tone ?? ""}\n${draft.ai_instructions ?? ""}`;
    return before === after;
  }, [draft, active]);

  async function handleSaveDraft() {
    setSaving(true);
    setError(null);
    const result = await savePromptDraft({ businessId, aiTone, aiInstructions, note });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDraft(result.release ?? null);
    router.refresh();
  }

  async function handlePromote(releaseId: string) {
    setPublishing(releaseId);
    setError(null);
    const result = await promotePromptRelease(businessId, releaseId);
    setPublishing(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    // The promoted release is now the active one, and no longer a draft --
    // clear local draft state so the editor reflects that on refresh.
    setDraft(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Draft</p>
          <h2 className="mt-1 text-lg font-semibold">
            {active ? `Editing — currently live: v${active.version}` : "Editing — nothing published yet"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Changes here only affect the draft. Nothing customers talk to changes until you publish.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            AI tone <span className="font-normal text-slate-400">— shapes how Mira talks</span>
          </label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="e.g. friendly, casual, short sentences"
            value={aiTone}
            onChange={(e) => setAiTone(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Additional instructions <span className="font-normal text-slate-400">— optional</span>
          </label>
          <textarea
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            rows={3}
            placeholder="e.g. Always mention we're cash-only on Mondays"
            value={aiInstructions}
            onChange={(e) => setAiInstructions(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Note <span className="font-normal text-slate-400">— what changed and why, shown in history</span>
          </label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="e.g. Tightened refund policy wording"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving}
            className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={() => draft && handlePromote(draft.id)}
            disabled={!draft || publishing === draft?.id}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            {publishing === draft?.id ? "Publishing…" : "Publish"}
          </button>
          {!draft && <span className="text-xs text-slate-400">Save a draft before you can publish.</span>}
        </div>
      </section>

      {draft && (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Diff</p>
            <h2 className="mt-1 text-lg font-semibold">Draft vs. what&apos;s live now</h2>
          </div>
          <DiffBlock label="AI tone" before={active?.ai_tone ?? ""} after={draft.ai_tone ?? ""} />
          <DiffBlock
            label="Additional instructions"
            before={active?.ai_instructions ?? ""}
            after={draft.ai_instructions ?? ""}
          />
          {draftMatchesActive && (
            <p className="text-sm text-slate-500">The draft is identical to what&apos;s currently live.</p>
          )}
        </section>
      )}

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">History</p>
          <h2 className="mt-1 text-lg font-semibold">Published versions</h2>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing published yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {history.map((release) => {
              const isActive = active?.id === release.id;
              return (
                <div key={release.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      v{release.version} {isActive && <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Live</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Published {formatDate(release.published_at)} by {release.published_by}
                      {release.note ? ` — ${release.note}` : ""}
                    </p>
                  </div>
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => handlePromote(release.id)}
                      disabled={publishing === release.id}
                      className="shrink-0 rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {publishing === release.id ? "Rolling back…" : "Roll back to this version"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
