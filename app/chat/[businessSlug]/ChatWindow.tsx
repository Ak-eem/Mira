"use client";

import { uuidV4FromRandomValues } from "@/lib/chat/visitor";
import { embedStrongHoverClass, embedStrongTextClass, embedUsesTransparentSurface } from "@/lib/embed/surface";
import { Icon } from "@/components/site/icons";
import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import { chatThemeVars } from "@/lib/brandColor";
import { BusinessNotFound } from "./BusinessNotFound";
import { Nunito } from "next/font/google";
import { linkifyContent } from "@/lib/linkify";
import { CUSTOMER_REASON_LABELS, FEEDBACK_REASONS, type FeedbackReason } from "@/lib/feedback/reasons";

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
const SITE_FONT = "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif";
const GENERIC_ERROR_MESSAGE = "Something went wrong on our end. Please try again.";

type ProductImage = { name: string; imageUrl: string };
type Feedback = "up" | "down";
type Message = {
  role: "customer" | "assistant" | "system";
  content: string;
  id?: string;
  productImages?: ProductImage[];
  feedback?: Feedback;
  // Why the customer gave a thumbs-down (optional), and whether we're
  // currently offering the reason chips for this message.
  feedbackReason?: FeedbackReason;
  askReason?: boolean;
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

// crypto.randomUUID needs a secure context; getRandomValues works everywhere.
// Never fall back to Date.now()/Math.random(): the visitor id is the only
// secret protecting this visitor's transcript.
function randomVisitorId(): string {
  return uuidV4FromRandomValues((bytes) => crypto.getRandomValues(bytes));
}

export function ChatWindow({
  businessSlug,
  businessName,
  openNow,
  embedMode = false,
  brandColor = null,
  backgroundColor = null,
  suggestions = [],
}: {
  businessSlug: string;
  businessName: string;
  openNow: boolean | null;
  embedMode?: boolean;
  // Owner's brand colour (#rrggbb) or null for Mira's default. Applied as CSS variables on
  // the chat's root, so every accent-coloured element picks it up.
  brandColor?: string | null;
  // Owner's page background (#rrggbb) or null for Mira's default cream. Also re-derives the
  // text greys, borders and card surfaces so light and dark backgrounds both stay readable.
  backgroundColor?: string | null;
  // One-tap questions for the full-screen page's empty chat, built from what the business actually has
  // (see lib/chat/suggestions.ts). Empty means no chips. The embedded widget has its own fixed set.
  suggestions?: string[];
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
            : randomVisitorId();
        window.localStorage.setItem(storageKey, generated);
        return generated;
      }
    } catch {
      // localStorage unavailable (private browsing, disabled storage, etc.)
      // -- fall through to an in-memory-only id below.
    }
    return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : randomVisitorId();
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endedConversationId, setEndedConversationId] = useState<string | null>(null);
  // Orders the business has confirmed or shipped that this visitor can still
  // mark as received. Filled from the same 6s poll that picks up operator
  // replies -- web chat has no push channel, so this thread is where a
  // customer finds out, and where they tell us it arrived.
  const [deliverableOrders, setDeliverableOrders] = useState<
    { id: string; items: { name: string; quantity: number }[] }[]
  >([]);
  const [markingOrderId, setMarkingOrderId] = useState<string | null>(null);
  const [conversationEnded, setConversationEnded] = useState(false);
  const [ratingState, setRatingState] = useState<"pending" | "submitting" | "done" | "skipped">("pending");
  const [locked, setLocked] = useState(false);
  // Set when any endpoint says this business no longer exists (e.g. it was cancelled while the chat was open).
  const [unavailable, setUnavailable] = useState(false);
  const [expandedImage, setExpandedImage] = useState<{ url: string; name: string } | null>(null);
  const [notificationEmail, setNotificationEmail] = useState("");
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notificationJustSaved, setNotificationJustSaved] = useState(false);
  // Lazily read from localStorage, same pattern as visitorId above --
  // avoids re-showing the prompt to a returning visitor on this device
  // who already said yes or no. The backend consent record (keyed on
  // business_id + web_${visitorId}) stays the actual source of truth for
  // whether an email gets sent; this only controls whether the widget
  // nags about it again.
  const [notificationConsentSaved, setNotificationConsentSaved] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage?.getItem(`mira_notif_${businessSlug}`) === "saved";
    } catch {
      return false;
    }
  });
  const [notificationDismissed, setNotificationDismissed] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage?.getItem(`mira_notif_${businessSlug}`) === "dismissed";
    } catch {
      return false;
    }
  });

  const transparentEmbed = embedUsesTransparentSurface(embedMode, backgroundColor);
  useEffect(() => {
    if (!transparentEmbed) return;
    const body = document.body;
    const previousBackgroundColor = body.style.backgroundColor;
    const previousBackgroundImage = body.style.backgroundImage;
    body.style.backgroundColor = "transparent";
    body.style.backgroundImage = "none";
    return () => {
      body.style.backgroundColor = previousBackgroundColor;
      body.style.backgroundImage = previousBackgroundImage;
    };
  }, [transparentEmbed]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length === 0) return;
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!expandedImage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedImage(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedImage]);

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

        // A locked business responds 402 with {locked:true} (see
        // app/api/chat/messages/route.ts) instead of the normal message
        // list. Stop polling entirely once that's detected -- there's
        // nothing further to fetch until the business is unlocked, and
        // continuing to poll would just repeat the same 402 every tick.
        if (res.status === 402) {
          setLocked(true);
          clearInterval(interval);
          return;
        }
        if (res.status === 404) {
          const body = (await res.json().catch(() => null)) as { code?: string } | null;
          if (body?.code === "business_not_found") {
            setUnavailable(true);
            clearInterval(interval);
            return;
          }
        }
        if (!res.ok) return;

        const data = (await res.json().catch(() => null)) as {
          locked?: boolean;
          orders?: { id: string; items: { name: string; quantity: number }[] }[];
          messages?: {
            id: string;
            role: "customer" | "assistant";
            content: string;
            productImages?: ProductImage[];
            isOperatorReply?: boolean;
            isSystemNotice?: boolean;
          }[];
        } | null;

        if (data?.locked) {
          setLocked(true);
          clearInterval(interval);
          return;
        }

        if (Array.isArray(data?.orders)) setDeliverableOrders(data.orders);

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

  async function markOrderReceived(orderId: string) {
    setMarkingOrderId(orderId);
    try {
      const res = await fetch("/api/chat/orders/delivered", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessSlug, visitorId, orderId }),
      });
      // Either outcome removes the button: on success it's delivered, on a
      // 404/409 the order already moved on. The next poll shows the notice.
      if (res.ok || res.status === 404 || res.status === 409) {
        setDeliverableOrders((prev) => prev.filter((order) => order.id !== orderId));
      }
    } catch {
      // Leave the button in place so the customer can try again.
    } finally {
      setMarkingOrderId(null);
    }
  }

  async function submitFeedback(index: number, messageId: string, rating: Feedback, reason?: FeedbackReason) {
    // A thumbs-down tapped again after a reason was chosen keeps that reason
    // (the server would otherwise overwrite it with "none").
    const reasonToSend = rating === "down" ? (reason ?? messages[index]?.feedbackReason) : undefined;

    setMessages((prev) => {
      const next = [...prev];
      const target = next[index];
      if (target) {
        next[index] = {
          ...target,
          feedback: rating,
          feedbackReason: reasonToSend,
          // Offer the chips right after a thumbs-down, once, and never push
          // them on someone who already answered or gave a thumbs-up.
          askReason: rating === "down" && !reasonToSend,
        };
      }
      return next;
    });

    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, rating, reason: reasonToSend, businessSlug, visitorId }),
      });
    } catch {
      // Feedback is a nice-to-have, not core chat function -- fail silently
      // rather than surface an error banner over a submitted reply.
    }
  }

  // Lets the customer end the conversation themselves, distinct from an
  // operator ending it from admin/portal (see ended_by in
  // supabase/migrations/0026_customer_rating.sql). Scoped the same way as
  // every other customer chat call: businessSlug + visitorId resolve to
  // the same business_id + session_token the backend already trusts, so
  // a customer can only ever end their own conversation.
  async function confirmEndConversation() {
    setEnding(true);
    setShowEndConfirm(false);
    try {
      const res = await fetch("/api/chat/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessSlug, visitorId }),
      });
      const data = (await res.json().catch(() => null)) as { conversationId?: string | null } | null;
      setConversationEnded(true);
      setEndedConversationId(data?.conversationId ?? null);
    } catch {
      // Ending is best-effort from the customer's point of view -- even if
      // this request fails, showing the ended/rating state is harmless,
      // and a stray open conversation just times out via the normal 24h
      // idle close in lib/chat/processMessage.ts.
      setConversationEnded(true);
    } finally {
      setEnding(false);
    }
  }

  async function submitRating(rating: number) {
    if (!endedConversationId) {
      setRatingState("skipped");
      return;
    }
    setRatingState("submitting");
    try {
      await fetch("/api/chat/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessSlug, visitorId, conversationId: endedConversationId, rating }),
      });
    } catch {
      // Rating is optional feedback, not core chat function -- same
      // fail-silent spirit as submitFeedback above.
    } finally {
      setRatingState("done");
    }
  }

  async function sendMessage(message: string) {
    const text = message.trim();
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
        const data = (await res.json().catch(() => null)) as { locked?: boolean; error?: string; code?: string } | null;
        if (res.status === 404 && data?.code === "business_not_found") {
          setUnavailable(true);
        } else if (res.status === 402 || data?.locked) {
          setLocked(true);
        } else {
          setError(GENERIC_ERROR_MESSAGE);
        }
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

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    await sendMessage(input);
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

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function saveNotificationConsent() {
    const email = notificationEmail.trim();
    if (!email || !EMAIL_PATTERN.test(email)) {
      setNotificationError("Enter a valid email address.");
      return;
    }
    setNotificationSaving(true);
    setNotificationError(null);
    try {
      const res = await fetch("/api/chat/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessSlug, visitorId, email }),
      });
      if (!res.ok) {
        setNotificationError("Couldn't save that. Try again.");
        return;
      }
      setNotificationConsentSaved(true);
      setNotificationJustSaved(true);
      try {
        window.localStorage?.setItem(`mira_notif_${businessSlug}`, "saved");
      } catch {
        // Non-fatal -- the consent itself is already saved server-side;
        // this just means the prompt might show again on this device.
      }
    } catch {
      setNotificationError("Couldn't reach the server. Try again.");
    } finally {
      setNotificationSaving(false);
    }
  }

  function dismissNotificationPrompt() {
    setNotificationDismissed(true);
    try {
      window.localStorage?.setItem(`mira_notif_${businessSlug}`, "dismissed");
    } catch {
      // Non-fatal -- worst case the prompt reappears next visit.
    }
  }

  // Once locked (detected via a 402 from either the polling loop or a
  // send attempt -- see the useEffect and handleSend above), nothing else
  // in the widget is reachable: no message history, no input, no rating
  // prompt. This mirrors the initial-load check in page.tsx for a
  // business that's inactive from the start; this is the same outcome
  // reached mid-session instead of at first render.
  if (unavailable) return <BusinessNotFound embed={embedMode} />;

  if (locked) {
    if (!embedMode) {
      return (
        <div
          className="flex h-dvh items-center justify-center bg-canvas p-4 text-ink"
          style={{ ...(chatThemeVars(brandColor, backgroundColor) as React.CSSProperties | undefined), fontFamily: SITE_FONT }}
        >
          <div className="max-w-sm rounded-[28px] bg-surface px-6 py-8 text-center shadow-float">
            <p className="text-sm text-muted">This business is temporarily unavailable.</p>
          </div>
        </div>
      );
    }
    return (
      <div className={`flex h-dvh flex-col mira-wash items-center justify-center ${nunito.className}`}>
        <div className="glass-panel-strong mx-4 max-w-sm rounded-lg px-6 py-8 text-center">
          <p className="text-sm text-slate-600">This business is temporarily unavailable.</p>
        </div>
      </div>
    );
  }

  const brandStyle = chatThemeVars(brandColor, backgroundColor) as React.CSSProperties | undefined;
  const showChatHeader = !embedMode || openNow !== null || messages.length > 0;
  // The full-screen page uses the Mira website's chat look (tokens from the website design system); the
  // embedded widget keeps its own. A custom brand colour still wins over the website's ink.
  const site = !embedMode;
  const accentFill = brandColor ? "bg-accent text-on-accent" : "bg-ink text-white";
  const banner = site ? "border-b border-line/80 bg-mist" : "glass-panel-strong";
  const smallRadius = site ? "rounded-full" : "rounded-sm";
  // Side padding that keeps the content in a centred column of at most 46rem on a wide screen (so borders and
  // surfaces still run edge to edge) and is a plain 1rem on a phone.
  const padX = site ? "px-[max(1rem,calc(50%-23rem))]" : "px-4";
  const initial = Array.from(businessName.trim())[0]?.toUpperCase() ?? "•";
  const statusText = openNow === true ? "Open now · replies instantly" : openNow === false ? "Closed · replies instantly" : "Replies instantly";
  const showSiteChips = site && messages.length === 0 && suggestions.length > 0 && !conversationEnded;
  const embeddedSuggestions = [
    "Show me your products",
    "Shipping information",
    "What are your hours?",
  ];

  return (
    <div
      className={embedMode ? `flex h-dvh flex-col mira-wash ${nunito.className}` : "flex h-dvh flex-col bg-surface text-ink"}
      style={embedMode ? { ...brandStyle, ...(transparentEmbed ? { background: "transparent" } : {}) } : { ...brandStyle, fontFamily: SITE_FONT }}
    >
      {/* Website look: the whole screen. Embedded: the wrapper adds no box. */}
      <div className={embedMode ? "contents" : "relative flex min-h-0 flex-1 flex-col"}>
        {showChatHeader &&
          (embedMode ? (
            <header className="flex items-center justify-between gap-2 px-4 py-2">
              <div className="flex items-center gap-2">
                {openNow !== null && (
                  <span className={openNow ? "text-xs font-medium text-emerald-600" : "text-xs font-medium text-slate-400"}>
                    {openNow ? "● Open now" : "Closed"}
                  </span>
                )}
                {messages.length > 0 && !conversationEnded && !showEndConfirm && (
                  <button
                    type="button"
                    onClick={() => setShowEndConfirm(true)}
                    className="text-xs font-medium text-slate-400 hover:text-slate-600"
                  >
                    End chat
                  </button>
                )}
              </div>
            </header>
          ) : (
            <header className={`flex items-center gap-3 border-b border-line/80 py-3 ${padX}`}>
              <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-full text-[15px] font-semibold ${accentFill}`}>
                {initial}
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-[14px] font-medium">{businessName}</h1>
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <span className={`size-1.5 rounded-full ${openNow === false ? "bg-line" : "bg-lime-3"}`} />
                  {statusText}
                </p>
              </div>
              {messages.length > 0 && !conversationEnded && !showEndConfirm && (
                <button
                  type="button"
                  onClick={() => setShowEndConfirm(true)}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-mist hover:text-ink"
                >
                  End chat
                </button>
              )}
            </header>
          ))}

        {showEndConfirm && (
          <div className={`${banner} flex items-center justify-between gap-3 py-2 text-xs ${padX}`}>
            <span className="text-slate-600">End this conversation?</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowEndConfirm(false)}
                className={`${smallRadius} px-2 py-1 font-medium text-slate-500 hover:text-slate-700`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmEndConversation}
                disabled={ending}
                className={`${smallRadius} bg-accent px-2 py-1 font-medium text-on-accent hover:bg-accent-dark disabled:opacity-50`}
              >
                End chat
              </button>
            </div>
          </div>
        )}

        {!locked &&
          deliverableOrders.map((order) => (
            <div key={order.id} className={`${banner} flex items-center justify-between gap-3 py-2 text-xs ${padX}`}>
              <span className="min-w-0 truncate text-slate-600">
                Your order{order.items.length > 0 ? `: ${order.items.map((item) => item.name).join(", ")}` : ""}
              </span>
              <button
                type="button"
                onClick={() => markOrderReceived(order.id)}
                disabled={markingOrderId === order.id}
                className="shrink-0 rounded-sm bg-accent px-2 py-1 font-medium text-on-accent hover:bg-accent-dark disabled:opacity-50"
              >
                {markingOrderId === order.id ? "Saving..." : "I received it"}
              </button>
            </div>
          ))}

        {/* Shown once a real exchange has happened, so it's contextual
            rather than the first thing a visitor sees. Consent is opt-in
            and explicit -- nothing gets saved until they submit an email
            here, matching the same pattern as ending a chat or leaving
            feedback: a deliberate action, not an assumption. */}
        {messages.length > 0 &&
          !conversationEnded &&
          !locked &&
          !notificationConsentSaved &&
          !notificationDismissed && (
            <div className={`${banner} space-y-2 py-3 ${padX}`}>
              <p className="text-xs text-slate-600">Want delivery updates by email?</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="email"
                  value={notificationEmail}
                  onChange={(e) => setNotificationEmail(e.target.value)}
                  placeholder="you@example.com"
                  aria-label="Email address for delivery updates"
                  className={`min-w-0 flex-1 ${smallRadius} border border-teal-900/10 bg-white/70 px-3 py-2 text-sm focus:border-accent focus:outline-hidden focus:ring-1 focus:ring-accent`}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={notificationSaving || !notificationEmail.trim()}
                    onClick={saveNotificationConsent}
                    className={`glass-hover ${smallRadius} bg-accent px-3 py-2 text-sm font-medium text-on-accent hover:bg-accent-dark disabled:opacity-50`}
                  >
                    {notificationSaving ? "Saving..." : "Yes, notify me"}
                  </button>
                  <button
                    type="button"
                    onClick={dismissNotificationPrompt}
                    className={`${smallRadius} px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700`}
                  >
                    Not now
                  </button>
                </div>
              </div>
              {notificationError && <p className="text-xs text-red-600">{notificationError}</p>}
            </div>
          )}

        {notificationJustSaved && (
          <div className={`${banner} py-2 text-xs text-emerald-600 ${padX}`}>
            You&apos;ll get an email when your order status changes.
          </div>
        )}

        <div className={`ui-scroll-y min-h-0 flex-1 space-y-3 py-4 ${padX}`}>
          {messages.length === 0 && (
            <div className={embedMode ? "flex h-full flex-col justify-center gap-5 pb-8" : "text-left"}>
              {embedMode && (
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
                  </svg>
                </div>
              )}
              <div className={embedMode ? "text-center" : "text-left"}>
                {embedMode && <h2 className={`mb-2 text-xl font-semibold ${embedStrongTextClass(backgroundColor)}`}>How can we help?</h2>}
                <span className={embedMode ? "inline-block max-w-sm rounded-xl px-4 py-3 text-sm text-slate-600" : "message-enter inline-block max-w-[85%] rounded-[18px] rounded-bl-md bg-mist px-3.5 py-2.5 text-[14px] leading-snug"}>
                  Hi! 👋 Ask me anything about {businessName} — hours, prices, what we
                  offer, and more.
                </span>
              </div>
              {embedMode && (
                <div className="mx-auto flex max-w-lg flex-wrap justify-center gap-2" aria-label="Suggested questions">
                  {embeddedSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      disabled={sending}
                      onClick={() => void sendMessage(suggestion)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:border-accent/40 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {messagesWithUniqueImages.map((m, i) =>
            m.role === "system" ? (
              <div key={i} className="message-enter text-center">
                <span className={`${embedMode ? "glass-panel text-slate-500" : "bg-mist text-muted"} inline-block rounded-full px-3 py-1 text-xs`}>
                  {m.content}
                </span>
              </div>
            ) : (
            <div
              key={i}
              className={`message-enter ${m.role === "customer" ? "text-right" : "text-left"}`}
            >
              {m.role === "assistant" ? (
                <div
                  className={`${embedMode ? "inline-block max-w-[85%] rounded-2xl bg-white/65 px-4 py-3 text-sm shadow-sm backdrop-blur-md" : "inline-block max-w-[85%] rounded-[18px] rounded-bl-md bg-mist px-3.5 py-2.5 text-[14px] leading-snug"}`}
                >
                  {renderAssistantContent(m.content)}
                </div>
              ) : (
                <span className={embedMode ? "inline-block max-w-[85%] rounded-lg border border-white/35 bg-accent px-3 py-2 text-sm text-on-accent shadow-[0_8px_20px_-12px_rgba(15,42,34,0.6)]" : `inline-block max-w-[85%] rounded-[18px] rounded-br-md px-3.5 py-2.5 text-[14px] leading-snug ${accentFill}`}>
                  {linkifyContent(m.content)}
                </span>
              )}

              {m.role === "assistant" && m.productImages && m.productImages.length > 0 && (
                <div className="mt-3 flex max-w-full gap-3 overflow-x-auto pb-2">
                  {m.productImages.map((p) => (
                    <button
                      key={p.imageUrl}
                      type="button"
                      onClick={() => setExpandedImage({ url: p.imageUrl, name: p.name })}
                      className={`${embedMode ? "glass-hover rounded-xl border-slate-200 bg-white shadow-sm" : "rounded-[18px] border-line bg-surface"} w-36 shrink-0 overflow-hidden border text-left`}
                      aria-label={`Expand image of ${p.name}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.imageUrl}
                        alt={p.name}
                        className="h-24 w-full cursor-zoom-in object-cover"
                      />
                      <span className={`block truncate px-2.5 py-2 font-medium ${embedMode ? "text-xs text-slate-700" : "text-[13px] text-ink"}`}>{p.name}</span>
                    </button>
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
                        ? "rounded-sm p-1 text-emerald-600"
                        : `rounded-sm p-1 ${embedMode ? `${embedStrongTextClass(backgroundColor)} ${embedStrongHoverClass(backgroundColor)}` : "text-muted hover:text-ink"}`
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
                        ? "rounded-sm p-1 text-red-500"
                        : `rounded-sm p-1 ${embedMode ? `${embedStrongTextClass(backgroundColor)} ${embedStrongHoverClass(backgroundColor)}` : "text-muted hover:text-ink"}`
                    }
                  >
                    <ThumbIcon direction="down" filled={m.feedback === "down"} />
                  </button>
                </div>
              )}

              {m.role === "assistant" && m.id && m.feedback === "down" && m.askReason && (
                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs" role="group" aria-label="What went wrong?">
                  <span className="text-slate-400">What went wrong?</span>
                  {FEEDBACK_REASONS.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => submitFeedback(i, m.id!, "down", code)}
                      className={`rounded-full border px-2 py-0.5 ${embedMode ? "border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700" : "border-line text-muted hover:border-ink/30 hover:text-ink"}`}
                    >
                      {CUSTOMER_REASON_LABELS[code]}
                    </button>
                  ))}
                </div>
              )}
              {m.role === "assistant" && m.feedback === "down" && m.feedbackReason && !m.askReason && (
                <p className="mt-1 text-xs text-slate-400">Thanks, noted: {CUSTOMER_REASON_LABELS[m.feedbackReason].toLowerCase()}.</p>
              )}
            </div>
            )
          )}
          {sending &&
            (site ? (
              <div role="status" aria-label="Assistant is typing" className="flex w-fit items-center gap-1 rounded-[18px] rounded-bl-md bg-mist px-3.5 py-3">
                {[0, 1, 2].map((dot) => (
                  <span key={dot} className="dot-bounce size-1.5 rounded-full bg-ink" style={{ animationDelay: `${dot * 0.14}s` }} />
                ))}
              </div>
            ) : (
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
            ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div ref={containerRef} />
        </div>

        {showSiteChips && (
          <div className={`flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] ${padX}`} role="group" aria-label="Suggested questions">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={sending}
                onClick={() => void sendMessage(suggestion)}
                className="h-8 shrink-0 rounded-full border border-line bg-surface px-3 text-[13px] text-ink-2 transition-colors hover:border-ink/30 disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {conversationEnded ? (
          <div className={`${site ? "border-t border-line/80 bg-mist" : "glass-panel-strong"} flex flex-col items-center gap-2 py-4 ${padX}`}>
            {ratingState === "done" ? (
              <p className="text-sm font-medium text-slate-600">Thanks for your feedback! 💛</p>
            ) : ratingState === "skipped" ? (
              <p className="text-sm text-slate-500">Conversation ended.</p>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-600">How was your experience?</p>
                <div className="flex gap-3">
                  {[
                    { rating: 1, emoji: "😠", label: "Very unhappy" },
                    { rating: 2, emoji: "🙁", label: "Unhappy" },
                    { rating: 3, emoji: "😐", label: "Neutral" },
                    { rating: 4, emoji: "🙂", label: "Happy" },
                    { rating: 5, emoji: "😄", label: "Very happy" },
                  ].map((option) => (
                    <button
                      key={option.rating}
                      type="button"
                      aria-label={option.label}
                      disabled={ratingState === "submitting"}
                      onClick={() => submitRating(option.rating)}
                      className="glass-hover rounded-full p-1.5 text-2xl leading-none disabled:opacity-50"
                    >
                      {option.emoji}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setRatingState("skipped")}
                  className="text-xs font-medium text-slate-400 hover:text-slate-600"
                >
                  No thanks
                </button>
              </>
            )}
          </div>
        ) : (
          <form
            onSubmit={handleSend}
            className={embedMode ? "flex w-full px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" : `flex items-center gap-2 border-t border-line/80 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${padX}`}
          >
            {embedMode ? (
              <div className="flex w-full min-w-0 items-center rounded-full border border-slate-200 bg-white px-2 py-1 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
                <input
                  className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm focus:border-transparent focus:outline-hidden focus:ring-0"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question…"
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="shrink-0 rounded-full bg-accent px-5 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-dark disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            ) : (
              <>
                <input
                  aria-label="Message"
                  className="h-11 min-w-0 flex-1 rounded-full bg-mist px-4 text-[15px] outline-none placeholder:text-muted focus:bg-line/60"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question…"
                />
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={sending || !input.trim()}
                  className={`grid size-11 shrink-0 place-items-center rounded-full transition-[transform,opacity] active:scale-95 disabled:opacity-30 ${accentFill}`}
                >
                  <Icon name="send" size={17} />
                </button>
              </>
            )}
          </form>
        )}
        <div className={`pb-2 text-center text-[11px] ${embedMode ? "pt-1.5 text-slate-400" : "text-muted"}`}>
          Powered by <span className={`font-medium ${embedMode ? "text-slate-500" : "text-ink-2"}`}>Mira AI</span>
        </div>

        {expandedImage && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-6"
            onClick={() => setExpandedImage(null)}
          >
            <button
              type="button"
              onClick={() => setExpandedImage(null)}
              aria-label="Close"
              className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-slate-700 shadow-lg hover:bg-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={expandedImage.url}
              alt={expandedImage.name}
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full rounded-lg object-contain shadow-2xl message-enter"
            />
          </div>
        )}
      </div>
    </div>
  );
}
