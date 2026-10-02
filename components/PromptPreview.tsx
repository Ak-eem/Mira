"use client";

import { useRef, useState } from "react";
import { describeSignal, type GroundingResult } from "@/lib/grounding/assess";

type Turn = { assistantMessageId: string; conversationId: string; question: string; flagged: boolean };

type SideResult = { text: string; grounding: GroundingResult } | { error: string };
type ReplayOk = { question: string; oldReply: string; active: SideResult; draft: SideResult; changed: boolean };
type ReplayResponse = { skipped: string } | ReplayOk;

type Row = { turn: Turn; result: ReplayOk };

const CONCURRENCY = 3;

// A draft that matches the business info LESS well than the live prompt is the
// regression worth shouting about; "unchecked" (nothing to verify) counts as fine.
const RANK: Record<string, number> = { high: 3, unchecked: 3, medium: 2, low: 1 };
function rankOf(side: SideResult): number {
  return "grounding" in side ? (RANK[side.grounding.verdict] ?? 3) : 3;
}

function SideBlock({ label, side, emphasise }: { label: string; side: SideResult; emphasise?: boolean }) {
  const weak = "grounding" in side && (side.grounding.verdict === "low" || side.grounding.verdict === "medium");
  return (
    <div className={`space-y-1 rounded-lg border p-3 ${emphasise ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200 bg-slate-50"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      {"error" in side ? (
        <p className="text-sm text-slate-400">{side.error}</p>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm text-slate-800">{side.text}</p>
          {weak && (
            <p className={`text-xs ${side.grounding.verdict === "low" ? "text-red-600" : "text-amber-600"}`}>
              Grounding: {side.grounding.verdict}
              {side.grounding.signals.filter((s) => !s.supported).length > 0 &&
                ` — ${side.grounding.signals.filter((s) => !s.supported).map(describeSignal).join("; ")}`}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * "Preview impact" for a saved prompt draft: replays real recent customer
 * questions against the live prompt and the draft and shows what would change.
 * Read-only end to end -- the endpoints never save, send or flag anything.
 * The browser drives one turn per request so no single call runs long.
 */
export function PromptPreview({
  endpoint,
  draftId,
  unsaved,
}: {
  endpoint: string;
  draftId: string | null;
  unsaved: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [failed, setFailed] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const stopRef = useRef(false);

  async function start() {
    if (!draftId) return;
    stopRef.current = false;
    setRunning(true);
    setFinished(false);
    setRows([]);
    setSkipped(0);
    setFailed(0);
    setDone(0);
    setTotal(0);
    setMessage(null);

    try {
      const listResponse = await fetch(endpoint);
      if (!listResponse.ok) {
        const body = (await listResponse.json().catch(() => null)) as { error?: string } | null;
        setMessage(body?.error ?? "Couldn't load recent conversations.");
        return;
      }
      const { turns } = (await listResponse.json()) as { turns: Turn[] };
      if (turns.length === 0) {
        setMessage("There are no recent AI replies to replay yet. Once customers have chatted, you can preview here.");
        return;
      }
      setTotal(turns.length);

      const queue = [...turns];
      async function worker() {
        while (!stopRef.current) {
          const turn = queue.shift();
          if (!turn) return;
          try {
            const response = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ releaseId: draftId, assistantMessageId: turn.assistantMessageId }),
            });
            if (response.status === 429) {
              stopRef.current = true;
              setMessage("You've run a lot of previews recently. Please try again a little later.");
            } else if (!response.ok) {
              setFailed((n) => n + 1);
            } else {
              const body = (await response.json()) as ReplayResponse;
              if ("skipped" in body) setSkipped((n) => n + 1);
              else setRows((prev) => [...prev, { turn, result: body }]);
            }
          } catch {
            setFailed((n) => n + 1);
          }
          setDone((n) => n + 1);
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
      setFinished(true);
    } catch {
      setMessage("Couldn't run the preview. Check your connection and try again.");
    } finally {
      setRunning(false);
    }
  }

  const changed = rows.filter((row) => row.result.changed);
  const unchanged = rows.filter((row) => !row.result.changed);
  const worse = rows.filter((row) => rankOf(row.result.draft) < rankOf(row.result.active)).length;
  const better = rows.filter((row) => rankOf(row.result.draft) > rankOf(row.result.active)).length;

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Preview</p>
        <h2 className="mt-1 text-lg font-semibold">See the impact before you publish</h2>
        <p className="mt-1 text-sm text-slate-500">
          Replays up to 12 real recent customer questions against what&apos;s live now and against your saved draft, side
          by side. Nothing is sent to any customer and nothing is saved. It uses your business info as it is today, and
          wording varies a little each time, so judge the draft against &ldquo;live now&rdquo;, not just the past reply.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={start}
          disabled={running || !draftId || unsaved}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
        >
          {running ? "Replaying…" : "Preview impact"}
        </button>
        {running && (
          <button type="button" onClick={() => (stopRef.current = true)} className="text-sm text-slate-500 hover:text-slate-800">
            Stop
          </button>
        )}
        {running && total > 0 && (
          <span className="text-sm text-slate-500">
            {done} of {total} done
          </span>
        )}
        {!draftId && <span className="text-xs text-slate-400">Save a draft first.</span>}
        {draftId && unsaved && <span className="text-xs text-amber-600">You have unsaved edits. Save the draft; the preview uses the saved version.</span>}
      </div>

      {message && <p className="text-sm text-slate-500">{message}</p>}

      {(finished || rows.length > 0) && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-800">
            {changed.length} of {rows.length} answers would change.
            {worse > 0 && <span className="ml-2 text-red-600">{worse} match your business info less well than the live prompt.</span>}
            {better > 0 && <span className="ml-2 text-emerald-700">{better} match it better.</span>}
          </p>
          {(skipped > 0 || failed > 0) && (
            <p className="text-xs text-slate-400">
              {skipped > 0 && `${skipped} skipped (standard replies, not AI-written). `}
              {failed > 0 && `${failed} couldn't be replayed.`}
            </p>
          )}

          <ul className="space-y-3">
            {changed.map(({ turn, result }) => (
              <li key={turn.assistantMessageId} className="space-y-2 rounded-xl border border-slate-200 p-3">
                <p className="text-sm text-slate-600">
                  <span className="font-medium">Customer asked:</span> {result.question}
                  {turn.flagged && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-600">had been flagged</span>}
                </p>
                <div className="grid gap-2 md:grid-cols-3">
                  <SideBlock label="Past reply" side={{ text: result.oldReply, grounding: { verdict: "unchecked", signals: [] } }} />
                  <SideBlock label="Live now" side={result.active} />
                  <SideBlock label="Your draft" side={result.draft} emphasise />
                </div>
              </li>
            ))}
          </ul>

          {unchanged.length > 0 && (
            <details className="text-sm text-slate-500">
              <summary className="cursor-pointer">{unchanged.length} answers stay essentially the same</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {unchanged.map(({ turn, result }) => (
                  <li key={turn.assistantMessageId}>{result.question}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
