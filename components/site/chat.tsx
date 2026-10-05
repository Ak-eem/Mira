'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getProducts, sendChat } from '@/lib/site/api'
import { business } from '@/lib/site/mock'
import { cx, naira } from '@/lib/site/format'
import type { ChatMessage, Product } from '@/lib/site/types'
import { Icon } from './icons'
import { Badge, Logo, ProductImage } from './ui'

const SUGGESTIONS = ['Show me kaftans', 'How much is delivery to Abuja?', 'Where is MRA-2040?', 'Are you open on Sunday?']

const now = () => new Date().toISOString()
const greeting = (): ChatMessage => ({ id: 'hello', from: 'assistant', text: business.greeting, at: now() })

/**
 * Chat state for the demo assistant. `inviteAfter` adds the signup invitation
 * once the visitor has had that many answers (the landing-page flow).
 */
export function useChat({ inviteAfter }: { inviteAfter?: number } = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [greeting()])
  const [typing, setTyping] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const invited = useRef(false)

  useEffect(() => {
    getProducts().then(setProducts)
  }, [])

  const send = useCallback(
    async (text: string) => {
      const t = text.trim()
      if (!t || typing) return
      const mine: ChatMessage = { id: crypto.randomUUID(), from: 'customer', text: t, at: now() }
      const history = [...messages, mine]
      setMessages(history)
      setFailed(null)
      setTyping(true)
      try {
        const answer = await sendChat(t, history)
        const next = [...history, answer]
        const answers = next.filter((m) => m.from === 'assistant').length - 1
        if (inviteAfter && answers >= inviteAfter && !invited.current) {
          invited.current = true
          next.push({
            id: 'invite',
            from: 'assistant',
            text: 'That’s Mira, answering from a demo store’s own data. Want this on your website?',
            link: { label: 'Start your free trial', href: '/signup' },
            at: now(),
          })
        }
        setMessages(next)
      } catch {
        setFailed(t)
      } finally {
        setTyping(false)
      }
    },
    [messages, typing, inviteAfter],
  )

  const retry = useCallback(() => {
    if (!failed) return
    setMessages((m) => m.slice(0, -1))
    const t = failed
    setFailed(null)
    setTimeout(() => send(t), 0)
  }, [failed, send])

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

export function Bubble({ m, products, onOpen }: { m: ChatMessage; products: Product[]; onOpen: (p: Product) => void }) {
  const mine = m.from === 'customer'
  const cards = (m.products ?? []).map((id) => products.find((p) => p.id === id)).filter(Boolean) as Product[]
  return (
    <div className={cx('flex flex-col gap-2 animate-rise', mine ? 'items-end' : 'items-start')}>
      <div
        className={cx(
          'max-w-[85%] whitespace-pre-line rounded-[18px] px-3.5 py-2.5 text-[14px] leading-snug',
          mine ? 'rounded-br-md bg-ink text-white' : m.from === 'owner' ? 'rounded-bl-md bg-lime text-ink' : 'rounded-bl-md bg-mist text-ink',
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
        // Same tab, on purpose: the chat keeps its place.
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
export function ChatPanel({ chat, compact = false, onClose }: { chat: ReturnType<typeof useChat>; compact?: boolean; onClose?: () => void }) {
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
  const fresh = messages.length === 1

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-line/80 px-4 py-3">
        <span className="grid size-9 place-items-center rounded-full bg-ink text-white">
          <Logo wordmark={false} className="scale-75 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">{business.name} assistant</p>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-lime-3" /> Online · replies instantly
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full transition-colors hover:bg-mist" aria-label="Close chat">
            <Icon name="x" size={16} />
          </button>
        )}
      </header>

      <div ref={scroller} className={cx('flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4', compact ? 'max-h-none' : '')} aria-live="polite">
        {messages.map((m) => (
          <Bubble key={m.id} m={m} products={products} onOpen={setPreview} />
        ))}
        {typing && <TypingIndicator />}
        {failed && (
          <div className="flex items-center gap-2 self-end text-xs text-danger animate-fade">
            Not sent.
            <button type="button" onClick={retry} className="font-medium underline underline-offset-2">
              Retry
            </button>
          </div>
        )}
      </div>

      {fresh && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => submit(s)} className="h-8 shrink-0 rounded-pill border border-line bg-surface px-3 text-[13px] text-ink-2 transition-colors hover:border-ink/30">
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex items-center gap-2 border-t border-line/80 p-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit(text)
        }}
      >
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
      </form>
      <p className="pb-2 text-center text-[11px] text-muted">Answers come only from {business.name}’s own info · Powered by Mira</p>

      {preview && <Preview p={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

/** Floating bubble + panel, as it sits on a customer's website. */
export function ChatWidget({ color = business.brandColor, defaultOpen = false }: { color?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [nudge, setNudge] = useState(false)
  const chat = useChat({ inviteAfter: 2 })

  useEffect(() => {
    const t = setTimeout(() => setNudge(true), 2500)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {open && (
        <div className="glass flex h-[min(620px,calc(100dvh-110px))] w-[min(380px,calc(100vw-32px))] origin-bottom-right flex-col overflow-hidden rounded-[28px] shadow-float animate-pop">
          <ChatPanel chat={chat} onClose={() => setOpen(false)} />
        </div>
      )}
      {!open && nudge && (
        <button type="button" onClick={() => setOpen(true)} className="glass hidden max-w-[240px] rounded-[18px] sm:block rounded-br-md px-4 py-3 text-left text-[13px] leading-snug shadow-float animate-pop">
          Questions about sizes, delivery or an order? Ask me.
        </button>
      )}
      <button
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
      </button>
    </div>
  )
}
