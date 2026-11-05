"use client";

import { useEffect, useRef, useState } from "react";

type Figure = { label: string; value: number; unit?: string };
type Source = {
  tool: string;
  what: string;
  method: string;
  period: string | null;
  timeZone: string | null;
  status: "ok" | "partial" | "no_data" | "error";
  notes: string[];
  figures: Figure[];
};
type Kind = "answer" | "cannot_tell" | "numbers_only" | "incomplete";
type Entry =
  | { role: "owner"; text: string }
  | { role: "mira"; kind: Kind; text: string; sources: Source[] }
  | { role: "mira"; kind: "error"; text: string; sources: Source[] };

const EXAMPLES = [
  "What were my busiest hours last week?",
  "How many conversations mentioned refunds this month?",
  "How many orders did I get last month, and what was the revenue?",
  "Which questions couldn't Mira answer this month?",
];

function formatFigure(figure: Figure): string {
  const number = figure.value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return figure.unit ? `${figure.unit} ${number}` : number;
}

function SourceList({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  return (
    <details className="mt-2 rounded-xl bg-white px-4 py-3 text-sm text-slate-700 shadow-[0_0_0_1px_rgb(226_232_240)]">
      <summary className="cursor-pointer select-none font-medium text-slate-900">
        Based on {sources.length === 1 ? "1 lookup" : `${sources.length} lookups`}
      </summary>
      <div className="mt-3 space-y-4">
        {sources.map((source, index) => (
          <div key={`${source.tool}-${index}`}>
            <p className="font-medium text-slate-900">{source.what}</p>
            {source.period && (
              <p className="text-slate-600">
                {source.period}
              </p>
            )}
            {source.notes.map((note) => (
              <p key={note} className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-amber-800">{note}</p>
            ))}
            {source.figures.length > 0 && (
              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                {source.figures.map((figure) => (
                  <div key={figure.label} className="contents">
                    <dt className="text-slate-600">{figure.label}</dt>
                    <dd className="text-right font-medium tabular-nums text-slate-900">{formatFigure(figure)}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="mt-2 text-xs text-slate-500">{source.method}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

export function AskPanel({ businessId }: { businessId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries, thinking]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || thinking) return;
    setInput("");
    setEntries((current) => [...current, { role: "owner", text }]);
    setThinking(true);
    try {
      const response = await fetch(`/api/portal/businesses/${businessId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const body = (await response.json().catch(() => null)) as { kind?: Kind; text?: string; sources?: Source[]; error?: string } | null;
      if (!response.ok || !body?.kind || typeof body.text !== "string") {
        setEntries((current) => [...current, { role: "mira", kind: "error", text: body?.error ?? "Something went wrong. Please try again.", sources: [] }]);
      } else {
        setEntries((current) => [...current, { role: "mira", kind: body.kind as Kind, text: body.text as string, sources: body.sources ?? [] }]);
      }
    } catch {
      setEntries((current) => [...current, { role: "mira", kind: "error", text: "Couldn't reach Mira. Check your connection and try again.", sources: [] }]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="ui-card flex min-h-[60vh] flex-col overflow-hidden !p-0">
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {entries.length === 0 && (
          <div className="ui-enter py-6 text-center">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">What would you like to know?</h2>
            <p className="ui-subtitle mx-auto mt-1 text-center">Mira doesn&apos;t keep a history of your questions. Weeks run Monday to Sunday, in your business&apos;s own timezone.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" onClick={() => ask(example)} className="ui-btn ui-btn-secondary ui-btn-sm">
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {entries.map((entry, index) =>
          entry.role === "owner" ? (
            <div key={index} className="text-right">
              <span className="inline-block max-w-[85%] rounded-[1.25rem] rounded-br-md bg-accent px-4 py-2.5 text-left text-[15px] text-white">{entry.text}</span>
            </div>
          ) : (
            <div key={index} className="text-left">
              <span
                className={
                  entry.kind === "error"
                    ? "inline-block max-w-[85%] whitespace-pre-wrap rounded-[1.25rem] rounded-bl-md bg-red-50 px-4 py-2.5 text-[15px] text-red-700"
                    : entry.kind === "cannot_tell" || entry.kind === "incomplete"
                      ? "inline-block max-w-[85%] whitespace-pre-wrap rounded-[1.25rem] rounded-bl-md bg-amber-50 px-4 py-2.5 text-[15px] text-amber-900"
                      : "inline-block max-w-[85%] whitespace-pre-wrap rounded-[1.25rem] rounded-bl-md bg-slate-100 px-4 py-2.5 text-[15px] text-slate-900"
                }
              >
                {entry.text}
              </span>
              <SourceList sources={entry.sources} />
            </div>
          ),
        )}

        {thinking && <p className="ui-typing" aria-label="Mira is looking at your data"><span /><span /><span /></p>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void ask(input);
        }}
        className="flex gap-2 border-t border-slate-200/80 bg-white p-3"
      >
        <input
          className="ui-field flex-1"
          aria-label="Ask a question about your data"
          value={input}
          maxLength={500}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about your chats, orders or replies…"
          disabled={thinking}
        />
        <button type="submit" disabled={thinking || !input.trim()} className="ui-btn ui-btn-primary" aria-busy={thinking}>
          Ask
        </button>
      </form>
    </div>
  );
}
