"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { interpretInventoryCommand as interpretCommand, executeInventoryCommand as executeCommand, type CommandResult } from "./actions";

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
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [turns, thinking, pending]);

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
    <div className="ui-card flex min-h-[60vh] flex-col overflow-hidden !p-0">
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {turns.length === 0 && !pending && (
          <div className="ui-enter py-6 text-center">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">What changed in your shop?</h2>
            <p className="ui-subtitle mx-auto mt-1 text-center">Tell Mira in your own words. It shows you what it understood, and nothing changes until you confirm.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {["We're out of the red shirts", "Set the blue hoodie to ₦8,500", "We close at 5pm on Fridays", "Add an FAQ: do you deliver?"].map((chip) => (
                <button key={chip} type="button" onClick={() => setInput(chip)} className="ui-btn ui-btn-secondary ui-btn-sm">{chip}</button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => {
          if (t.role === "user") {
            return (
              <div key={i} className="text-right">
                <span className="inline-block max-w-[85%] rounded-[1.25rem] rounded-br-md bg-accent px-4 py-2.5 text-[15px] text-white">
                  {t.text}
                </span>
              </div>
            );
          }
          if ("done" in t) {
            return (
              <div key={i} className="text-left">
                <span className="inline-block max-w-[85%] rounded-[1.25rem] rounded-bl-md bg-emerald-50 px-4 py-2.5 text-[15px] text-emerald-800">
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
                    ? "inline-block max-w-[85%] rounded-[1.25rem] rounded-bl-md bg-red-50 px-4 py-2.5 text-[15px] text-red-700"
                    : "inline-block max-w-[85%] rounded-[1.25rem] rounded-bl-md bg-slate-100 px-4 py-2.5 text-[15px] text-slate-900"
                }
              >
                {r.message}
              </span>
            </div>
          );
        })}

        {thinking && <p className="ui-typing" aria-label="Mira is thinking"><span /><span /><span /></p>}

        {pending && pending.kind === "confirm" && (
          <div className="ui-enter rounded-2xl bg-white p-4 shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-accent)_30%,transparent)]">
            <p className="mb-3 text-[15px] text-slate-900">{pending.summary}</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleConfirm(pending.action, pending.payload)}
                disabled={executing}
                className="ui-btn ui-btn-primary ui-btn-sm"
              >
                {executing ? "Working…" : "Confirm"}
              </button>
              <button
                onClick={handleCancel}
                disabled={executing}
                className="ui-btn ui-btn-secondary ui-btn-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {pending && pending.kind === "choose" && (
          <div className="ui-enter rounded-2xl bg-white p-4 shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-accent)_30%,transparent)]">
            <p className="mb-3 text-sm">I found more than one match. Which did you mean?</p>
            <div className="space-y-2">
              {pending.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() =>
                    setPending({ kind: "confirm", action: pending.action, summary: opt.summary, payload: opt.payload })
                  }
                  className="ui-btn ui-btn-secondary w-full !justify-start text-left"
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button onClick={handleCancel} className="ui-btn ui-btn-plain ui-btn-sm mt-2">
              Cancel
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSend} className="flex gap-2 border-t border-slate-200/80 bg-white p-3">
        <input
          className="ui-field flex-1" aria-label="Tell Mira what to change"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tell Mira what to change…"
          disabled={thinking || !!pending}
        />
        <button
          type="submit"
          disabled={thinking || !!pending || !input.trim()}
          className="ui-btn ui-btn-primary" aria-busy={thinking}
        >
          Send
        </button>
      </form>
    </div>
  );
}
