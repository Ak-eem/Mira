"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { interpretCommand, executeCommand, type CommandResult } from "./actions";

type Turn =
  | { role: "user"; text: string }
  | { role: "assistant"; result: CommandResult }
  | { role: "assistant"; done: true; message: string };

export function CommandCenter({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<CommandResult | null>(null);
  const [thinking, setThinking] = useState(false);
  const [executing, setExecuting] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || thinking || pending) return;

    setTurns((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setThinking(true);

    const result = await interpretCommand(businessId, text);
    setThinking(false);

    if (result.kind === "confirm" || result.kind === "choose") {
      setPending(result);
    } else {
      setTurns((prev) => [...prev, { role: "assistant", result }]);
    }
  }

  async function handleConfirm(action: string, payload: Record<string, unknown>) {
    setExecuting(true);
    const { error } = await executeCommand(businessId, action, payload);
    setExecuting(false);
    setPending(null);

    setTurns((prev) => [
      ...prev,
      error
        ? { role: "assistant", result: { kind: "error", message: error } }
        : { role: "assistant", done: true, message: "Done." },
    ]);

    if (!error) router.refresh();
  }

  function handleCancel() {
    setPending(null);
    setTurns((prev) => [...prev, { role: "assistant", result: { kind: "info", message: "Cancelled." } }]);
  }

  return (
    <div className="flex min-h-[60vh] flex-col rounded-lg border border-slate-200 bg-white">
      {/* Temporary disambiguation label -- remove this block (only this
          block) once it's no longer needed for telling this apart from
          the customer chat at a glance. */}
      <div className="flex items-center gap-2 rounded-t-lg border-b border-slate-200 bg-slate-50 px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          ⚙ Command Center -- Admin Only
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {turns.length === 0 && !pending && (
          <p className="text-sm text-slate-400">
            Try something like &quot;mark haircuts unavailable&quot; or &quot;add 20% off all
            services until Friday.&quot;
          </p>
        )}

        {turns.map((t, i) => {
          if (t.role === "user") {
            return (
              <div key={i} className="text-right">
                <span className="inline-block max-w-[85%] rounded-lg bg-accent px-3 py-2 text-sm text-white">
                  {t.text}
                </span>
              </div>
            );
          }
          if ("done" in t) {
            return (
              <div key={i} className="text-left">
                <span className="inline-block rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  ✓ {t.message}
                </span>
              </div>
            );
          }
          const r = t.result;
          if (r.kind !== "info" && r.kind !== "error") return null;
          return (
            <div key={i} className="text-left">
              <span
                className={
                  r.kind === "error"
                    ? "inline-block max-w-[85%] rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                    : "inline-block max-w-[85%] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                }
              >
                {r.message}
              </span>
            </div>
          );
        })}

        {thinking && <p className="text-sm text-slate-400">Thinking…</p>}

        {pending && pending.kind === "confirm" && (
          <div className="rounded-lg border border-accent bg-white p-3">
            <p className="mb-3 text-sm">{pending.summary}</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleConfirm(pending.action, pending.payload)}
                disabled={executing}
                className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {executing ? "Working…" : "Confirm"}
              </button>
              <button
                onClick={handleCancel}
                disabled={executing}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {pending && pending.kind === "choose" && (
          <div className="rounded-lg border border-accent bg-white p-3">
            <p className="mb-3 text-sm">I found more than one match -- which did you mean?</p>
            <div className="space-y-2">
              {pending.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() =>
                    setPending({ kind: "confirm", action: pending.action, summary: opt.summary, payload: opt.payload })
                  }
                  className="block w-full rounded border border-slate-300 px-3 py-2 text-left text-sm hover:border-accent"
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button onClick={handleCancel} className="mt-2 text-xs text-slate-400 hover:underline">
              Cancel
            </button>
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="flex gap-2 border-t border-slate-200 p-3">
        <input
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tell Mira what to change…"
          disabled={thinking || !!pending}
        />
        <button
          type="submit"
          disabled={thinking || !!pending || !input.trim()}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
