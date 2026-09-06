"use client";

import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import { Nunito } from "next/font/google";
import { linkifyContent } from "@/lib/linkify";

function renderInlineMarkdown(text: string): ReactNode {
  const parts = text.split(/(\*\*[^\n]+?\*\*|\*[^\n]+?\*)/g);
  return parts.map((part, index) => {
    const markerLength = part.startsWith("**") ? 2 : 1;
    if (
      part.startsWith("*") &&
      part.endsWith("*") &&
      part.length > markerLength * 2
    ) {
      return (
        <strong key={`${index}-bold`}>
          {linkifyContent(part.slice(markerLength, -markerLength))}
        </strong>
      );
    }
    return <span key={`${index}-text`}>{linkifyContent(part)}</span>;
  });
}

function renderAssistantContent(content: string): ReactNode {
  const lines = content.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let listItems: ReactNode[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = () => {
    if (!listItems.length || !listType) return;
    const List = listType === "ol" ? "ol" : "ul";
    nodes.push(
      <List
        key={`list-${nodes.length}`}
        className={listType === "ol" ? "my-1 list-decimal pl-5" : "my-1 list-disc pl-5"}
      >
        {listItems}
      </List>,
    );
    listItems = [];
    listType = null;
  };

  lines.forEach((line, index) => {
    const listMatch = line.match(/^\s*(?:(\d+)\.|[-*])\s+(.+)$/);
    if (listMatch) {
      const nextListType = listMatch[1] ? "ol" : "ul";
      if (listType && listType !== nextListType) flushList();
      listType = nextListType;
      listItems.push(<li key={`item-${index}`}>{renderInlineMarkdown(listMatch[2])}</li>);
      return;
    }
    flushList();
    if (!line.trim()) {
      nodes.push(<br key={`line-${index}`} />);
      return;
    }
    nodes.push(<span key={`line-${index}`}>{renderInlineMarkdown(line)}</span>);
    if (index < lines.length - 1) nodes.push(<br key={`break-${index}`} />);
  });

  flushList();
  return nodes;
}

// Scoped to this file only, on purpose -- the admin side stays plain
// system sans-serif, this is specifically about the customer-facing
// surface feeling warmer and more personable.
const nunito = Nunito({ subsets: ["latin"], weight: ["400", "600", "700"] });
const GENERIC_ERROR_MESSAGE = "Something went wrong on our end. Please try again.";

type ProductImage = { name: string; imageUrl: string };
type Feedback = "up" | "down";
type Message = {
  role: "customer" | "assistant" | "system";
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
  const [visitorId] = useState(() => {
    const storageKey = `mira_visitor_${businessSlug}`;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const existing = window.localStorage.getItem(storageKey);
        if (existing) return existing;

        const generated =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        window.localStorage.setItem(storageKey, generated);
        return generated;
      }
    } catch {
      // localStorage unavailable (private browsing, disabled storage, etc.)
      // -- fall through to an in-memory-only id below.
    }
    return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Picks up operator replies sent from the admin dashboard while this
  // conversation is flagged for a human -- the normal chat flow is pure
  // request/response, so without this, an operator's reply (or a
  // took-over/handed-back system notice) would only ever appear the next
  // time the customer sends a message themselves. Deliberately narrow:
  // only ever appends operator replies and system notices that aren't
  // already in local state, never touches customer messages or normal AI
  // replies, which the request/response flow already renders on its own.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/chat/messages?businessSlug=${encodeURIComponent(businessSlug)}&visitorId=${encodeURIComponent(visitorId)}`,
        );
        if (!res.ok) return;

        const data = (await res.json().catch(() => null)) as {
          messages?: {
            id: string;
            role: "customer" | "assistant";
            content: string;
            productImages?: ProductImage[];
            isOperatorReply?: boolean;
            isSystemNotice?: boolean;
          }[];
        } | null;

        const relevant = (data?.messages ?? []).filter((m) => m.isOperatorReply || m.isSystemNotice);
        if (relevant.length === 0) return;

        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id).filter(Boolean));
          const newOnes = relevant.filter((m) => !existingIds.has(m.id));
          if (newOnes.length === 0) return prev;
          return [
            ...prev,
            ...newOnes.map((m) => ({
              role: (m.isSystemNotice ? "system" : m.role) as Message["role"],
              content: m.content,
              id: m.id,
              productImages: m.productImages,
            })),
          ];
        });
      } catch {
        // Silent -- this is a background convenience poll, not core chat
        // function. A failed poll just means the reply shows up on the
        // next successful one instead.
      }
    }, 6000);

    return () => clearInterval(interval);
  }, [businessSlug, visitorId]);

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
        body: JSON.stringify({ businessSlug, message: text, visitorId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(GENERIC_ERROR_MESSAGE);
        return;
      }

      if (!res.body) {
        setError(GENERIC_ERROR_MESSAGE);
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
          setError(GENERIC_ERROR_MESSAGE);
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

      const messagesWithUniqueImages = useMemo(() => {
        const seenImageUrls = new Set<string>();
        return messages.map((message) => {
          if (!message.productImages) return message;
          const productImages = message.productImages.filter((product) => {
            if (seenImageUrls.has(product.imageUrl)) return false;
            seenImageUrls.add(product.imageUrl);
            return true;
          });
          return productImages.length === message.productImages.length
            ? message
            : { ...message, productImages };
        });
      }, [messages]);

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
        {messagesWithUniqueImages.map((m, i) =>
          m.role === "system" ? (
            <div key={i} className="text-center">
              <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                {m.content}
              </span>
            </div>
          ) : (
          <div key={i} className={m.role === "customer" ? "text-right" : "text-left"}>
            {m.role === "assistant" ? (
              <div className="inline-block max-w-[85%] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                {renderAssistantContent(m.content)}
              </div>
            ) : (
              <span className="inline-block max-w-[85%] rounded-lg bg-accent px-3 py-2 text-sm text-white">
                {linkifyContent(m.content)}
              </span>
            )}

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
          )
        )}
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
      <div className="border-t border-slate-100 bg-slate-50/60 pb-2 pt-1.5 text-center text-[11px] text-slate-400">
        Powered by <span className="font-medium text-slate-500">Mira AI</span>
      </div>
    </div>
  );
}
