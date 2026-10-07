import * as mock from './mock'
import { reply } from './assistant'
import type { ChatMessage, Conversation, DayHours, Faq, Insights, Order, OrderStatus, Overview, Policy, Product, Promotion } from './types'

/**
 * THE BACKEND SEAM.
 *
 * Every screen reads and writes through these functions and nothing else.
 * Today they work on an in-memory copy of the sample data in `mock.ts`, so the
 * design can be clicked through without a server. To connect a real backend,
 * replace each body with a `fetch` to the matching endpoint (suggested routes
 * are in the comments). The screens will not need to change.
 */

const copy = <T>(v: T): T => structuredClone(v)
const db = {
  products: copy(mock.products),
  orders: copy(mock.orders),
  conversations: copy(mock.conversations),
  faqs: copy(mock.faqs),
  policies: copy(mock.policies),
  hours: copy(mock.hours),
  promotions: copy(mock.promotions),
}

// GET /api/business
export async function getBusiness() {
  return mock.business
}

// GET /api/overview
export async function getOverview(): Promise<Overview> {
  return mock.overview
}

// GET /api/insights
export async function getInsights(): Promise<Insights> {
  return mock.insights
}

// GET /api/products
export async function getProducts(): Promise<Product[]> {
  return copy(db.products)
}

// PATCH /api/products/:id
export async function updateProduct(id: string, patch: Partial<Product>): Promise<Product> {
  const p = db.products.find((x) => x.id === id)
  if (!p) throw new Error('Product not found')
  Object.assign(p, patch)
  return copy(p)
}

// POST /api/products
export async function createProduct(p: Omit<Product, 'id'>): Promise<Product> {
  const created = { ...p, id: `p${Date.now()}` }
  db.products.unshift(created)
  return copy(created)
}

// GET /api/orders
export async function getOrders(): Promise<Order[]> {
  return copy(db.orders)
}

// PATCH /api/orders/:id  { status }
export async function updateOrderStatus(id: string, status: OrderStatus): Promise<Order> {
  const o = db.orders.find((x) => x.id === id)
  if (!o) throw new Error('Order not found')
  o.status = status
  o.updatedAt = new Date().toISOString()
  return copy(o)
}

// GET /api/conversations
export async function getConversations(): Promise<Conversation[]> {
  return copy(db.conversations)
}

// POST /api/conversations/:id/messages  { text }   (the owner replying by hand)
export async function sendOwnerReply(conversationId: string, text: string): Promise<ChatMessage> {
  const c = db.conversations.find((x) => x.id === conversationId)
  const m: ChatMessage = { id: crypto.randomUUID(), from: 'owner', text, at: new Date().toISOString() }
  c?.messages.push(m)
  return m
}

/**
 * POST /api/chat  { message, history }  →  ChatMessage
 *
 * The visitor-facing assistant. The real endpoint answers only from this
 * business's own catalog, FAQs, policies, hours and orders. The demo below
 * fakes that with keyword matching so the widget can be tried.
 */
async function sendMockChat(message: string, history: ChatMessage[]): Promise<ChatMessage> {
  await new Promise((r) => setTimeout(r, 700 + Math.random() * 500)) // let the typing indicator show
  return reply(message, history, { products: db.products, orders: db.orders, faqs: db.faqs, policies: db.policies, hours: db.hours, promotions: db.promotions })
}

const DEMO_SLUG = process.env.NEXT_PUBLIC_DEMO_BUSINESS_SLUG

function demoVisitorId(): string {
  try {
    let id = localStorage.getItem('mira-demo-visitor')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('mira-demo-visitor', id)
    }
    return id
  } catch {
    return crypto.randomUUID()
  }
}

/**
 * Landing-page demo chat. With NEXT_PUBLIC_DEMO_BUSINESS_SLUG set it talks to the real
 * /api/chat for that business (same assistant your customers get); without it, it falls
 * back to the sample keyword matcher so the page still works.
 */
export async function sendChat(message: string, history: ChatMessage[]): Promise<ChatMessage> {
  if (!DEMO_SLUG) return sendMockChat(message, history)
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ businessSlug: DEMO_SLUG, message, visitorId: demoVisitorId() }),
  })
  if (!res.ok || !res.body) throw new Error('chat request failed')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split(/\r?\n\r?\n/)
    buffer = events.pop() ?? ''
    for (const ev of events) {
      const data = ev.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n').trim()
      if (!data) continue
      try {
        const parsed = JSON.parse(data) as { token?: string }
        if (parsed.token) text += parsed.token
      } catch {
        /* ignore malformed event */
      }
    }
  }
  return { id: crypto.randomUUID(), from: 'assistant', text: text.trim() || 'Thanks. We will get back to you shortly.', at: new Date().toISOString() }
}

// GET/PUT /api/faqs
export async function getFaqs(): Promise<Faq[]> {
  return copy(db.faqs)
}
export async function saveFaqs(faqs: Faq[]): Promise<Faq[]> {
  db.faqs = copy(faqs)
  return faqs
}

// GET/PUT /api/policies
export async function getPolicies(): Promise<Policy[]> {
  return copy(db.policies)
}
export async function savePolicies(policies: Policy[]): Promise<Policy[]> {
  db.policies = copy(policies)
  return policies
}

// GET/PUT /api/hours
export async function getHours(): Promise<DayHours[]> {
  return copy(db.hours)
}
export async function saveHours(hours: DayHours[]): Promise<DayHours[]> {
  db.hours = copy(hours)
  return hours
}

// GET /api/promotions, PATCH /api/promotions/:id
export async function getPromotions(): Promise<Promotion[]> {
  return copy(db.promotions)
}
export async function updatePromotion(id: string, patch: Partial<Promotion>): Promise<Promotion> {
  const p = db.promotions.find((x) => x.id === id)
  if (!p) throw new Error('Promotion not found')
  Object.assign(p, patch)
  return copy(p)
}
