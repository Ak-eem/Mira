import type { ChatMessage, DayHours, Faq, Order, Policy, Product, Promotion } from './types'
import { naira } from './format'

type Knowledge = {
  products: Product[]
  orders: Order[]
  faqs: Faq[]
  policies: Policy[]
  hours: DayHours[]
  promotions: Promotion[]
}

/**
 * DEMO ONLY: a keyword matcher standing in for the real assistant so the widget can
 * be tried. Like the real assistant, it only ever answers from the business's
 * own data, and says so when it can't.
 */
export function reply(input: string, history: ChatMessage[], k: Knowledge): ChatMessage {
  const q = input.toLowerCase()
  const msg = (text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
    id: crypto.randomUUID(),
    from: 'assistant',
    text,
    at: new Date().toISOString(),
    ...extra,
  })
  const has = (...words: string[]) => words.some((w) => q.includes(w))

  // Order tracking: "where is MRA-2040"
  const orderId = q.match(/mra-?\s?(\d{4})/)
  if (orderId || has('my order', 'track', 'where is')) {
    const o = orderId && k.orders.find((x) => x.id === `MRA-${orderId[1]}`)
    if (o) {
      const status = { cart: 'is still in a cart and hasn’t been placed yet', placed: 'has been placed and is being packed', shipped: 'has shipped and is on its way', delivered: 'was delivered' }[o.status]
      return msg(`Order ${o.id} ${status}. Total: ${naira(o.total)}.`)
    }
    return msg('I can track that for you. What’s your order number? It looks like MRA-2040.')
  }

  // Products by name or category
  const byName = k.products.filter((p) => p.name.toLowerCase().split(' ').some((w) => w.length > 3 && q.includes(w)))
  const categories = [...new Set(k.products.map((p) => p.category.toLowerCase()))]
  const cat = categories.find((c) => q.includes(c.replace(/s$/, '')))
  const matches = byName.length ? byName : cat ? k.products.filter((p) => p.category.toLowerCase() === cat) : []

  if (matches.length) {
    const p = matches[0]
    if (has('stock', 'available', 'size', 'have')) {
      return p.available && p.stock > 0
        ? msg(`Yes, the ${p.name} is in stock (${p.stock} left). It’s ${naira(p.price)}.`, { products: [p.id] })
        : msg(`The ${p.name} is sold out right now. Here’s something similar that’s available:`, {
            products: k.products.filter((x) => x.available && x.id !== p.id).slice(0, 2).map((x) => x.id),
          })
    }
    return msg(matches.length > 1 ? `Here’s what we have in ${p.category.toLowerCase()}:` : `The ${p.name} is ${naira(p.price)}.`, {
      products: matches.slice(0, 3).map((x) => x.id),
    })
  }

  if (has('show', 'recommend', 'popular', 'best', 'new', 'catalog', 'products', 'what do you sell')) {
    return msg('Our most-loved pieces right now:', { products: ['p1', 'p5', 'p2'].filter((id) => k.products.some((p) => p.id === id)) })
  }

  if (has('deliver', 'shipping', 'ship', 'abuja', 'lagos', 'how long')) {
    const f = k.faqs.find((x) => x.id === 'f2')
    const d = k.faqs.find((x) => x.id === 'f1')
    return msg([f?.answer, d?.answer].filter(Boolean).join(' '))
  }
  if (has('return', 'refund', 'exchange')) {
    const p = k.policies.find((x) => x.id === 'returns')
    return msg(p ? p.body : 'Let me get the team to confirm our returns policy for you.', { link: { label: 'Read the full policy', href: '#policies' } })
  }
  if (has('pay', 'transfer', 'card', 'ussd')) {
    return msg(k.faqs.find((x) => x.id === 'f4')?.answer ?? 'We accept card and transfer.')
  }
  if (has('open', 'hour', 'close', 'sunday', 'saturday', 'time')) {
    const lines = k.hours.map((h) => `${h.day.slice(0, 3)}: ${h.closed ? 'closed' : `${h.open} to ${h.close}`}`)
    return msg(`Our opening hours:\n${lines.join('\n')}`)
  }
  if (has('discount', 'promo', 'code', 'sale', 'offer')) {
    const live = k.promotions.filter((p) => p.active)
    return msg(live.length ? live.map((p) => `${p.title}: ${p.discount} with code ${p.code}`).join('\n') : 'There are no promotions running right now.')
  }
  if (has('size')) {
    return msg(k.faqs.find((x) => x.id === 'f3')?.answer ?? '')
  }
  if (has('hi', 'hello', 'hey', 'good morning', 'good afternoon')) {
    return msg('Hello! Ask me about a product, delivery, returns, opening hours, or track an order.')
  }

  // Grounded: no guessing outside the business's data.
  const asked = history.filter((m) => m.from === 'customer').length
  return msg(
    asked > 2
      ? 'I can only answer from this store’s catalog, policies and orders, so I’ve passed your question to the team. They’ll reply here shortly.'
      : 'I don’t have that in this store’s information yet. Try asking about a product, delivery, returns or an order number.',
  )
}
