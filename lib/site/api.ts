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
export async function sendChat(message: string, history: ChatMessage[]): Promise<ChatMessage> {
  await new Promise((r) => setTimeout(r, 700 + Math.random() * 500)) // let the typing indicator show
  return reply(message, history, { products: db.products, orders: db.orders, faqs: db.faqs, policies: db.policies, hours: db.hours, promotions: db.promotions })
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
