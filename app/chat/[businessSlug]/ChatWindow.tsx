"use client";

import { useState, useRef, useEffect } from "react";
import { Nunito } from "next/font/google";
import { linkifyContent } from "@/lib/linkify";

// Scoped to this file only, on purpose -- the admin side stays plain
// system sans-serif, this is specifically about the customer-facing
// surface feeling warmer and more personable.
const nunito = Nunito({ subsets: ["latin"], weight: ["400", "600", "700"] });

const VISITOR_ID_KEY = "mira_visitor_id";

// A per-visitor id generated and stored on THIS side (localStorage),
// rather than trusted to a server-set cookie. The embed widget runs
// inside a cross-site <iframe> on a business's own website (see
// public/embed.js) -- a cookie set from inside that iframe is a
// third-party cookie, which Safari and Chrome increasingly refuse to
// send back on later requests. localStorage inside the iframe's own
// document doesn't have that problem, so this is what actually
// identifies "this same visitor, next message" reliably.
function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") return "";

  try {
    const existing = window.localStorage.getItem(VISITOR_ID_KEY);
    if (existing) return existing;

    const created = crypto.randomUUID();
    window.localStorage.setItem(VISITOR_ID_KEY, created);
    return created;
  } catch {
    // localStorage unavailable (private mode, disabled storage, etc.) --
    // fall back to a per-call id rather than throwing. Conversation
    // continuity degrades to "one conversation per message" for this
    // visitor, which is still correctly isolated from every other
    // visitor, just not persisted across reloads.
    return crypto.randomUUID();
  }
}

type ProductImage = { name: string; imageUrl: string };
type Feedback = "up" | "down";
type Message = {
  role: "customer" | "assistant";
  content: string;
  id?: string;
  productImages?: ProductImage[];
  feedback?: Feedback;
};

function ThumbIcon({ direction, filled }: { direction: "up" | "down"; filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={direction === "down" ? { transform: "rotate(180deg)" } : undefined}
    >
      <path d="M7 10v11" />
      <path d="M18.36 6.63 17 10h4a2 2 0 0 1 1.94 2.5l-1.93 7.5A2 2 0 0 1 19.06 21H7a1 1 0 0 1-1-1v-9a1 1 0 0 1 .29-.7l4.36-4.36A1.5 1.5 0 0 0 11 5V3a1 1 0 0 1 1-1c1 0 2.5 1 2.5 2.5S12.5 6 13.5 6.5" />
    </svg>
  );
}

export function ChatWindow({
  businessSlug,
  businessName,
  openNow,
  embedMode = false,
}: {
  businessSlug: string;
  businessName: string;
  openNow: boolean | null;
  embedMode?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function submitFeedback(index: number, messageId: string, rating: Feedback) {
    setMessages((prev) => {
      const next = [...prev];
      const target = next[index];
      if (target) next[index] = { ...target, feedback: rating };
      return next;
    });

    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, rating }),
      });
    } catch {
      // Feedback is a nice-to-have, not core chat function -- fail silently
      // rather than surface an error banner over a submitted reply.
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, { role: "customer", content: text }]);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessSlug, message: text, visitorId: getOrCreateVisitorId() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Something went wrong.");
        return;
      }

      if (!res.body) {
        setError("The server returned an empty response.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantStarted = false;

      const appendToken = (token: string) => {
        if (!token) return;

        setMessages((prev) => {
          if (!assistantStarted) {
            assistantStarted = true;
            return [...prev, { role: "assistant", content: token }];
          }

          const next = [...prev];
          const last = next[next.length - 1];

          if (last?.role === "assistant") {
            next[next.length - 1] = {
              ...last,
              content: last.content + token,
            };
          } else {
            next.push({ role: "assistant", content: token });
          }

          return next;
        });
      };

      const attachFinalMeta = (messageId: string | null, productImages: ProductImage[]) => {
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = {
              ...last,
              id: messageId ?? undefined,
              productImages: productImages.length > 0 ? productImages : undefined,
            };
          }
          return next;
        });
      };

      const handleEvent = (event: string) => {
        const dataLines = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart());

        if (dataLines.length === 0) return;

        const data = dataLines.join("\n").trim();
        if (!data) return;

        const parsed = JSON.parse(data) as {
          token?: string;
          done?: boolean;
          error?: string;
          messageId?: string | null;
          productImages?: ProductImage[];
        };

        if (parsed.error) {
          setError(parsed.error);
          return;
        }

        if (parsed.token) {
          appendToken(parsed.token);
        }

        if (parsed.done) {
          attachFinalMeta(parsed.messageId ?? null, parsed.productImages ?? []);
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop() ?? "";

          for (const event of events) {
            handleEvent(event);
          }
        }

        buffer += decoder.decode();

        if (buffer.trim()) {
          handleEvent(buffer);
        }
      } finally {
        reader.releaseLock();
      }
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`${embedMode ? "flex h-full flex-col" : "flex min-h-screen flex-col"} ${nunito.className}`}>
      <header
        className={
          embedMode
            ? "flex items-center justify-end border-b border-slate-200 bg-white px-3 py-2"
            : "flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3"
        }
      >
        {!embedMode && <span className="font-semibold">{businessName}</span>}
        {openNow !== null && (
          <span
            className={
              openNow
                ? "text-xs font-medium text-emerald-600"
                : "text-xs font-medium text-slate-400"
            }
          >
            {openNow ? "● Open now" : "Closed"}
          </span>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="text-left">
            <span className="inline-block max-w-[85%] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              Hi! 👋 Ask me anything about {businessName} — hours, prices, what we
              offer, and more.
            </span>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "customer" ? "text-right" : "text-left"}>
            <span
              className={
                m.role === "customer"
                  ? "inline-block max-w-[85%] rounded-lg bg-accent px-3 py-2 text-sm text-white"
                  : "inline-block max-w-[85%] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              }
            >
              {linkifyContent(m.content)}
            </span>

            {m.role === "assistant" && m.productImages && m.productImages.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.productImages.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={p.imageUrl}
                    src={p.imageUrl}
                    alt={p.name}
                    className="h-20 w-20 rounded-md border border-slate-200 object-cover"
                  />
                ))}
              </div>
            )}

            {m.role === "assistant" && m.id && (
              <div className="mt-1 flex gap-1">
                <button
                  type="button"
                  aria-label="Good response"
                  onClick={() => submitFeedback(i, m.id!, "up")}
                  className={
                    m.feedback === "up"
                      ? "rounded p-1 text-emerald-600"
                      : "rounded p-1 text-slate-300 hover:text-slate-500"
                  }
                >
                  <ThumbIcon direction="up" filled={m.feedback === "up"} />
                </button>
                <button
                  type="button"
                  aria-label="Poor response"
                  onClick={() => submitFeedback(i, m.id!, "down")}
                  className={
                    m.feedback === "down"
                      ? "rounded p-1 text-red-500"
                      : "rounded p-1 text-slate-300 hover:text-slate-500"
                  }
                >
                  <ThumbIcon direction="down" filled={m.feedback === "down"} />
                </button>
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="flex gap-1 px-1">
            <span
              className="h-2 w-2 animate-bounce rounded-full bg-slate-300"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="h-2 w-2 animate-bounce rounded-full bg-slate-300"
              style={{ animationDelay: "150ms" }}
            />
            <span
              className="h-2 w-2 animate-bounce rounded-full bg-slate-300"
              style={{ animationDelay: "300ms" }}
            />
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="flex gap-2 border-t border-slate-200 bg-white px-4 py-3"
      >
        <input
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question…"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
