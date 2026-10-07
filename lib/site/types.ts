/**
 * The shapes the UI expects from the backend. Keep these in sync with the API
 * and every screen keeps working.
 */

export type Product = {
  id: string
  name: string
  category: string
  price: number // in naira
  stock: number
  available: boolean
  /** Absolute or relative image URL. Without one the UI draws a soft placeholder. */
  image?: string
  /** Placeholder tint when there is no image. */
  tint?: 'lime' | 'sand' | 'mist' | 'stone'
}

export type OrderStatus = 'cart' | 'placed' | 'shipped' | 'delivered'

export type Order = {
  id: string
  customer: string
  phone: string
  items: { productId: string; qty: number }[]
  total: number
  status: OrderStatus
  channel: 'Website chat' | 'WhatsApp' | 'Instagram'
  updatedAt: string // ISO
}

export type ChatMessage = {
  id: string
  from: 'customer' | 'assistant' | 'owner'
  text: string
  /** Product ids to render as cards under the message. */
  products?: string[]
  /** Optional link rendered as a button (opens in the same tab). */
  link?: { label: string; href: string }
  at: string // ISO
}

export type Conversation = {
  id: string
  customer: string
  channel: Order['channel']
  unread: number
  resolved: boolean
  messages: ChatMessage[]
}

export type Overview = {
  queries: number
  orders: number
  revenue: number
  answeredRate: number // 0..1
  deltas: { queries: number; orders: number; revenue: number; answeredRate: number }
  /** Daily chat queries, oldest first. */
  series: number[]
  topProducts: { productId: string; orders: number }[]
}

export type Insights = {
  complaints: { label: string; count: number; change: number }[]
  questions: { question: string; count: number }[]
  demand: { productId: string; asks: number; orders: number }[]
}

export type Faq = { id: string; question: string; answer: string }
export type Policy = { id: string; title: string; body: string }
export type DayHours = { day: string; open: string; close: string; closed: boolean }
export type Promotion = { id: string; title: string; code: string; discount: string; ends: string; active: boolean }

export type Business = {
  name: string
  industry: string
  city: string
  brandColor: string
  greeting: string
}
