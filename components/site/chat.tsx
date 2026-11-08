'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getProducts } from '@/lib/site/api'
import { streamChat } from '@/lib/chat-stream'
import { cx, naira } from '@/lib/site/format'
import type { ChatMessage, Product } from '@/lib/site/types'
import { Icon } from './icons'
import { Badge, Logo, ProductImage } from './ui'

const BUSINESS_NAME = 'Mira'
const BUSINESS_SLUG = 'mira'
const VISITOR_ID_KEY = 'mira-demo-visitor-id'
const SUGGESTIONS = ['What can Mira do?', 'How much does it cost?', 'Does it work on WhatsApp?', 'How do I get started?']

const now = () => new Date().toISOString()

const greeting = (): ChatMessage => ({
  id: 'hello',
  from: 'assistant',
  text: `Hi! I'm Mira. Ask me what Mira can do for your business, what it costs, or how to get started.`,
  at: now(),
})

function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `m_${Math.random().toString(36).slice(2)}_${Date.now()}`
}

function getVisitorId(): string {
  if (typeof window === 'undefined') return uid()
  try {
    const existing = window.localStorage.getItem(VISITOR_ID_KEY)
    if (existing) return existing
    const id = uid()
    window.localStorage.setItem(VISITOR_ID_KEY, id)
    return id
  } catch {
    return uid()
  }
}

export function useChat({ inviteAfter }: { inviteAfter?: number } = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [greeting()])
  const [typing, setTyping] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const messagesRef = useRef(messages)
  const inFlight = useRef(false)
  const invited = useRef(false)

  const commitMessages = useCallback((next: ChatMessage[] | ((current: ChatMessage[]) => ChatMessage[])) => {
    setMessages((prev) => {
      const updated = typeof next === 'function' ? next(prev) : next
      messagesRef.current = updated
      return updated
    })
  }, [])

  useEffect(() => {
    getProducts().then(setProducts)
  }, [])

  const send = useCallback(
    async (text: string) => {
      const t = text.trim()
      if (!t || inFlight.current) return
      inFlight.current = true

      const mine: ChatMessage = { id: uid(), from: 'customer', text: t, at: now() }
      const history = [...messagesRef.current, mine]
      const streamId = uid()
      let streamedText = ''

      commitMessages(history)
      setFailed(null)
      setTyping(true)

      try {
        let completion: { done: true; messageId?: string; productImages?: unknown; silent?: boolean } | undefined

        for await (const event of streamChat({
          businessSlug: BUSINESS_SLUG,
          message: t,
          visitorId: getVisitorId(),
        })) {
          if (event.type === 'token') {
            streamedText += event.token
            const partial: ChatMessage = {
              id: streamId,
              from: 'assistant',
              text: streamedText,
              at: now(),
            }
            commitMessages([...history, partial])
          } else {
            completion = event
          }
        }

        if (!completion) {
          throw new Error('Chat stream ended without a completion event')
        }

        if (completion.silent) {
          commitMessages(history)
          return
        }

        const productIds = Array.isArray(completion.productImages)
          ? (completion.productImages as { productId?: string }[])
              .map((p) => p?.productId)
              .filter((id): id is string => typeof id === 'string')
          : undefined

        const answer: ChatMessage = {
          id: completion.messageId ?? streamId,
          from: 'assistant',
          text: streamedText,
          products: productIds && productIds.length > 0 ? productIds : undefined,
          at: now(),
        }
        const next = [...history, answer]
        const answers = next.filter((m) => m.from === 'assistant').length - 1

        if (inviteAfter && answers >= inviteAfter && !invited.current) {
          invited.current = true
          next.push({
            id: 'invite',
            from: 'assistant',
            text: "That's Mira, answering from Mira Demo Cafe's own data. Want this on your website?",
            link: { label: 'Start your free trial', href: '/signup' },
            at: now(),
          })
        }

        commitMessages(next)
      } catch {
        commitMessages(history)
        setFailed(t)
      } finally {
        inFlight.current = false
        setTyping(false)
      }
    },
    [commitMessages, inviteAfter],
  )

  const retry = useCallback(() => {
    if (!failed) return
    const t = failed
    commitMessages((current) => current.slice(0, -1))
    setFailed(null)
    setTimeout(() => {
      void send(t)
    }, 0)
  }, [commitMessages, failed, send])

  return { messages, typing, failed, send, retry, products }
}

export function TypingIndicator() {
  return (
    <div className="flex w-fit items-center gap-1 rounded-[18px] rounded-bl-md bg-mist px-3.5 py-3 animate-fade" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="dot-bounce size-1.5 rounded-full bg-ink" style={{ animationDelay: `${i * 0.14}s` }} />
      ))}
    </div>
  )
}

function ProductCard({ p, onOpen }: { p: Product; onOpen: (p: Product) => void }) {
  const out = !p.available || p.stock === 0
  return (
    <div className="flex w-[168px] shrink-0 flex-col overflow-hidden rounded-[18px] border border-line bg-surface animate-pop">
      <button type="button" onClick={() => onOpen(p)} className="block" aria-label={`View ${p.name}`}>
        <ProductImage image={p.image} name={p.name} tint={p.tint} className="h-[104px] w-full" />
      </button>
      <div className="flex flex-col gap-1.5 p-3">
        <span className="line-clamp-1 text-[13px] font-medium">{p.name}</span>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] tabular-nums">{naira(p.price)}</span>
          {out ? <Badge tone="danger">Sold out</Badge> : <Badge tone={p.stock <= 5 ? 'lime' : 'neutral'}>{p.stock <= 5 ? `${p.stock} left` : 'In stock'}</Badge>}
        </div>
      </div>
    </div>
  )
}

export function Bubble({ m, products, onOpen, widget = false }: { m: ChatMessage; products: Product[]; onOpen: (p: Product) => void; widget?: boolean }) {
  const mine = m.from === 'customer'
  const cards = (m.products ?? []).map((id) => products.find((p) => p.id === id)).filter(Boolean) as Product[]
  return (
    <div className={cx('flex flex-col gap-2 animate-rise', mine ? 'items-end' : 'items-start')}>
      <div
        className={cx(
          'max-w-[85%] whitespace-pre-line rounded-[18px] px-3.5 py-2.5 text-[14px] leading-snug',
          mine
            ? widget
              ? 'rounded-br-md border border-white/35 bg-ink text-white shadow-[0_8px_20px_-12px_rgb(15_42_34/0.6)]'
              : 'rounded-br-md bg-ink text-white'
            : m.from === 'owner'
              ? 'rounded-bl-md bg-lime text-ink'
              : widget
                ? 'rounded-bl-md bg-white/70 text-ink shadow-sm backdrop-blur-md'
                : 'rounded-bl-md bg-mist text-ink',
        )}
      >
        {m.text}
      </div>
      {cards.length > 0 && (
        <div className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {cards.map((p) => (
            <ProductCard key={p.id} p={p} onOpen={onOpen} />
          ))}
        </div>
      )}
      {m.link && (
        <a href={m.link.href} className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-ink px-4 text-[13px] font-medium text-white transition-transform active:scale-[0.97]">
          {m.link.label}
          <Icon name="arrow" size={14} />
        </a>
      )}
    </div>
  )
}

/** Full-size product view inside the chat panel. Opens in place, no new tab. */
function Preview({ p, onClose }: { p: Product; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-surface/95 p-4 animate-fade" role="dialog" aria-label={p.name}>
      <button type="button" onClick={onClose} className="ml-auto grid size-9 place-items-center rounded-full bg-mist" aria-label="Close preview">
        <Icon name="x" size={16} />
      </button>
      <ProductImage image={p.image} name={p.name} tint={p.tint} className="mt-3 aspect-square w-full rounded-[22px] animate-pop" />
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-muted">{p.category}</p>
          <p className="text-lg font-medium">{p.name}</p>
        </div>
        <p className="text-lg tabular-nums">{naira(p.price)}</p>
      </div>
    </div>
  )
}

/**
 * The conversation surface shared by the hero demo and the floating widget:
 * thread, typing indicator, suggestions, error state and composer.
 */
export function ChatPanel({
  chat,
  compact = false,
  onClose,
  onExpand,
  expanded = false,
}: {
  chat: ReturnType<typeof useChat>
  compact?: boolean
  onClose?: () => void
  onExpand?: () => void
  expanded?: boolean
}) {
  const { messages, typing, failed, send, retry, products } = chat
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<Product | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, typing, failed])

  const submit = (t: string) => {
    send(t)
    setText('')
  }
  const firstMessageIsGreeting = messages[0]?.id === 'hello'
  const fresh = messages.length === 1 && firstMessageIsGreeting
  const showWelcome = Boolean(onClose) && fresh

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <header className={cx('flex items-center', onClose ? 'min-h-12 justify-between gap-2 px-3 pt-1.5' : 'gap-3 border-b border-line/80 px-4 py-3')}>
        <div className="flex min-w-0 items-center gap-2">
          <span className={cx('grid place-items-center rounded-full', onClose ? 'size-7 bg-ink/5 text-ink' : 'size-9 bg-ink text-white')}>
            {onClose ? <Icon name="chat" size={15} /> : <Logo wordmark={false} className="scale-75 text-white" />}
          </span>
          <div className="min-w-0">
          <p className="truncate text-[14px] font-medium">{BUSINESS_NAME} assistant</p>
            {!onClose && (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <span className="size-1.5 rounded-full bg-lime-3" /> Online · replies instantly
              </p>
            )}
          </div>
        </div>
        {onClose && onExpand && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={onExpand} aria-label={expanded ? 'Restore chat size' : 'Expand chat'} aria-pressed={expanded} className="grid size-9 place-items-center rounded-full border border-line/50 bg-white text-ink-2 shadow-soft transition-colors hover:bg-mist">
              <Icon name={expanded ? 'compress' : 'expand'} size={16} />
            </button>
            <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full border border-line/50 bg-white text-ink-2 shadow-soft transition-colors hover:bg-mist" aria-label="Minimize chat">
              <Icon name="minus" size={16} />
            </button>
          </div>
        )}
      </header>

      <div ref={scroller} className={cx('flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4', compact ? 'max-h-none' : '')} aria-live="polite">
        {showWelcome && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 pb-8 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-ink/5 text-ink" aria-hidden="true">
              <Icon name="chat" size={24} />
            </span>
            <div className="max-w-sm">
              <h2 className="mb-2 text-xl font-semibold">How can I help?</h2>
              <p className="text-sm leading-relaxed text-muted">{messages[0].text}</p>
            </div>
          </div>
        )}
        {messages.slice(onClose && firstMessageIsGreeting ? 1 : 0).map((m) => (
          <Bubble key={m.id} m={m} products={products} onOpen={setPreview} widget={Boolean(onClose)} />
        ))}
        {typing && <TypingIndicator />}
        {failed && (
          <div className="flex items-center gap-2 self-end text-xs text-danger animate-fade">
            Not sent.{' '}
            <button type="button" onClick={retry} className="font-medium underline underline-offset-2">
              Retry
            </button>
          </div>
        )}
      </div>

      {fresh && (
        <div className={cx('gap-2 px-4 pb-3', onClose ? 'mx-auto flex max-w-lg flex-wrap justify-center' : 'flex overflow-x-auto')}>
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => submit(s)} className={cx('h-9 shrink-0 rounded-pill border border-line px-3 text-[13px] transition-colors hover:border-ink/30', onClose ? 'bg-white text-[12px] font-medium text-ink-2 shadow-sm' : 'bg-surface text-ink-2')}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className={cx('flex items-center gap-2', onClose ? 'px-4 py-3' : 'border-t border-line/80 p-3')}
        onSubmit={(e) => {
          e.preventDefault()
          submit(text)
        }}
      >
        {onClose ? (
          <div className="flex w-full min-w-0 items-center rounded-full border border-line bg-white px-2 py-1 focus-within:border-ink/40 focus-within:ring-1 focus-within:ring-ink/10">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask a question…"
              aria-label="Message"
              className="h-10 min-w-0 flex-1 border-0 bg-transparent px-3 text-sm outline-none placeholder:text-muted focus:ring-0"
            />
            <button
              type="submit"
              disabled={!text.trim() || typing}
              className="h-9 shrink-0 rounded-full bg-[#0f2a22] px-5 text-sm font-medium text-white transition-[transform,opacity] active:scale-95 disabled:opacity-50"
              aria-label="Send"
            >
              Send
            </button>
          </div>
        ) : (
          <>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask about a product, delivery, an order…"
              aria-label="Message"
              className="h-11 min-w-0 flex-1 rounded-pill bg-mist px-4 text-[15px] outline-none placeholder:text-muted focus:bg-line/60"
            />
            <button
              type="submit"
              disabled={!text.trim() || typing}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-white transition-[transform,opacity] active:scale-95 disabled:opacity-30"
              aria-label="Send"
            >
              <Icon name="send" size={17} />
            </button>
          </>
        )}
      </form>
      {onClose ? (
        <p className="pb-2 text-center text-[11px] text-muted">Powered by <span className="font-medium text-ink-2">Mira AI</span></p>
      ) : (
        <p className="pb-2 text-center text-[11px] text-muted">This is Mira answering about itself</p>
      )}

      {preview && <Preview p={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

/** Floating bubble + panel, as it sits on a customer's website. */
export function ChatWidget({ color = '#0f2a22', defaultOpen = false }: { color?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [expanded, setExpanded] = useState(false)
  const [nudge, setNudge] = useState(false)
  const chat = useChat({ inviteAfter: 2 })

  useEffect(() => {
    const t = setTimeout(() => setNudge(true), 2500)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className={cx('z-50 flex', expanded ? 'fixed inset-2 items-stretch justify-stretch sm:items-end sm:justify-end' : 'fixed right-4 bottom-4 flex-col items-end gap-3 sm:right-6 sm:bottom-6')}>
      {open && (
        <div className={cx('glass flex origin-bottom-right flex-col overflow-hidden rounded-2xl shadow-float animate-pop', expanded ? 'h-full w-full sm:h-[min(780px,calc(100dvh-48px))] sm:w-[min(920px,calc(100vw-48px))]' : 'h-[min(640px,calc(100dvh-110px))] w-[min(380px,calc(100vw-32px))]')}>
          <ChatPanel
            chat={chat}
            onClose={() => {
              setOpen(false)
              setExpanded(false)
            }}
            onExpand={() => setExpanded((value) => !value)}
            expanded={expanded}
          />
        </div>
      )}
      {!open && !expanded && nudge && (
        <button type="button" onClick={() => setOpen(true)} className="glass hidden max-w-[240px] rounded-[18px] sm:block rounded-br-md px-4 py-3 text-left text-[13px] leading-snug shadow-float animate-pop">
          Questions about sizes, delivery or an order? Ask me.
        </button>
      )}
      {!expanded && <button
        type="button"
        onClick={() => {
          setOpen((o) => !o)
          setNudge(false)
        }}
        aria-label={open ? 'Close chat' : 'Open chat'}
        aria-expanded={open}
        className="relative grid size-14 place-items-center rounded-full text-white shadow-float transition-transform duration-[var(--duration-base)] ease-[var(--ease-out)] hover:scale-105 active:scale-95"
        style={{ background: color }}
      >
        <span className={cx('absolute transition-all duration-[var(--duration-base)]', open ? 'scale-50 opacity-0' : 'scale-100 opacity-100')}>
          <Icon name="chat" size={22} />
        </span>
        <span className={cx('absolute transition-all duration-[var(--duration-base)]', open ? 'scale-100 opacity-100' : 'scale-50 opacity-0')}>
          <Icon name="x" size={20} />
        </span>
        {!open && <span className="absolute top-0.5 right-0.5 size-3.5 rounded-full border-2 border-white bg-lime-3" />}
      </button>}
    </div>
  )
}
