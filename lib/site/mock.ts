import type { Business, Conversation, DayHours, Faq, Insights, Order, Overview, Policy, Product, Promotion } from './types'

/**
 * Sample data for one demo business. Everything here is made up and only
 * exists so the design can be clicked through; the real data comes from the
 * backend through `src/lib/api.ts`.
 */

export const business: Business = {
  name: 'Adire Lane',
  industry: 'Fashion',
  city: 'Lagos',
  brandColor: '#111112',
  greeting: 'Hi! I’m Adire Lane’s assistant. Ask me about prices, sizes, delivery or your order.',
}

export const products: Product[] = [
  { id: 'p1', name: 'Indigo Adire Kaftan', category: 'Kaftans', price: 38000, stock: 14, available: true, tint: 'mist' },
  { id: 'p2', name: 'Ankara Wrap Dress', category: 'Dresses', price: 27500, stock: 6, available: true, tint: 'lime' },
  { id: 'p3', name: 'Aso-Oke Clutch', category: 'Bags', price: 18000, stock: 0, available: false, tint: 'sand' },
  { id: 'p4', name: 'Linen Agbada Set', category: 'Kaftans', price: 65000, stock: 4, available: true, tint: 'stone' },
  { id: 'p5', name: 'Tie-Dye Two-Piece', category: 'Sets', price: 31000, stock: 22, available: true, tint: 'lime' },
  { id: 'p6', name: 'Leather Slides', category: 'Shoes', price: 21000, stock: 9, available: true, tint: 'sand' },
  { id: 'p7', name: 'Adire Bucket Hat', category: 'Accessories', price: 9500, stock: 31, available: true, tint: 'mist' },
  { id: 'p8', name: 'Silk Head Wrap', category: 'Accessories', price: 12000, stock: 2, available: true, tint: 'stone' },
]

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

export const orders: Order[] = [
  { id: 'MRA-2041', customer: 'Tolu Adebayo', phone: '0803 *** 4412', items: [{ productId: 'p1', qty: 1 }, { productId: 'p7', qty: 2 }], total: 57000, status: 'placed', channel: 'Website chat', updatedAt: ago(12) },
  { id: 'MRA-2040', customer: 'Chiamaka Obi', phone: '0816 *** 0937', items: [{ productId: 'p2', qty: 1 }], total: 27500, status: 'shipped', channel: 'WhatsApp', updatedAt: ago(95) },
  { id: 'MRA-2039', customer: 'Ibrahim Musa', phone: '0705 *** 2290', items: [{ productId: 'p4', qty: 1 }], total: 65000, status: 'delivered', channel: 'Website chat', updatedAt: ago(60 * 26) },
  { id: 'MRA-2038', customer: 'Funke Ojo', phone: '0902 *** 7711', items: [{ productId: 'p5', qty: 2 }], total: 62000, status: 'cart', channel: 'Instagram', updatedAt: ago(7) },
  { id: 'MRA-2037', customer: 'Emeka Nwosu', phone: '0813 *** 5521', items: [{ productId: 'p6', qty: 1 }, { productId: 'p8', qty: 1 }], total: 33000, status: 'shipped', channel: 'Website chat', updatedAt: ago(60 * 5) },
  { id: 'MRA-2036', customer: 'Aisha Bello', phone: '0806 *** 3304', items: [{ productId: 'p1', qty: 2 }], total: 76000, status: 'delivered', channel: 'WhatsApp', updatedAt: ago(60 * 50) },
  { id: 'MRA-2035', customer: 'Kunle Bakare', phone: '0814 *** 6620', items: [{ productId: 'p7', qty: 1 }], total: 9500, status: 'placed', channel: 'Website chat', updatedAt: ago(40) },
  { id: 'MRA-2034', customer: 'Ngozi Eze', phone: '0809 *** 1185', items: [{ productId: 'p2', qty: 1 }, { productId: 'p6', qty: 1 }], total: 48500, status: 'cart', channel: 'Website chat', updatedAt: ago(3) },
]

export const overview: Overview = {
  queries: 1284,
  orders: 146,
  revenue: 4_870_500,
  answeredRate: 0.96,
  deltas: { queries: 0.18, orders: 0.12, revenue: 0.21, answeredRate: 0.02 },
  series: [62, 71, 58, 80, 77, 92, 88, 95, 84, 101, 97, 110, 104, 121],
  topProducts: [
    { productId: 'p1', orders: 41 },
    { productId: 'p5', orders: 33 },
    { productId: 'p2', orders: 27 },
    { productId: 'p6', orders: 19 },
  ],
}

export const insights: Insights = {
  complaints: [
    { label: 'Delivery took longer than expected', count: 23, change: -0.12 },
    { label: 'Size ran small', count: 14, change: 0.08 },
    { label: 'Couldn’t pay by transfer', count: 9, change: -0.3 },
    { label: 'Item out of stock after ordering', count: 6, change: 0.5 },
  ],
  questions: [
    { question: 'How much is delivery to Abuja?', count: 188 },
    { question: 'Do you have this in size 14?', count: 141 },
    { question: 'Where is my order?', count: 126 },
    { question: 'Can I return if it doesn’t fit?', count: 97 },
    { question: 'Are you open on Sunday?', count: 64 },
  ],
  demand: [
    { productId: 'p1', asks: 312, orders: 41 },
    { productId: 'p5', asks: 240, orders: 33 },
    { productId: 'p2', asks: 205, orders: 27 },
    { productId: 'p3', asks: 160, orders: 0 },
    { productId: 'p6', asks: 98, orders: 19 },
    { productId: 'p4', asks: 51, orders: 6 },
    { productId: 'p8', asks: 22, orders: 4 },
    { productId: 'p7', asks: 18, orders: 9 },
  ],
}

export const faqs: Faq[] = [
  { id: 'f1', question: 'How long does delivery take?', answer: 'Lagos: 1 to 2 working days. Other states: 3 to 5 working days.' },
  { id: 'f2', question: 'How much is delivery?', answer: '₦3,000 within Lagos, ₦6,500 to other states. Free on orders above ₦80,000.' },
  { id: 'f3', question: 'What sizes do you stock?', answer: 'UK 8 to 18 for dresses and sets. Kaftans and agbada come in S, M, L, XL.' },
  { id: 'f4', question: 'How can I pay?', answer: 'Card, bank transfer or USSD at checkout. Pay on delivery is available in Lagos.' },
]

export const policies: Policy[] = [
  { id: 'returns', title: 'Returns & exchanges', body: 'Unworn items can be returned within 7 days of delivery for an exchange or store credit. Sale items are final.' },
  { id: 'delivery', title: 'Delivery', body: 'We deliver nationwide with GIG Logistics. Orders placed before 2pm ship the same day.' },
  { id: 'privacy', title: 'Privacy', body: 'We only use your phone number and address to deliver your order and send updates about it.' },
]

export const hours: DayHours[] = [
  { day: 'Monday', open: '09:00', close: '18:00', closed: false },
  { day: 'Tuesday', open: '09:00', close: '18:00', closed: false },
  { day: 'Wednesday', open: '09:00', close: '18:00', closed: false },
  { day: 'Thursday', open: '09:00', close: '18:00', closed: false },
  { day: 'Friday', open: '09:00', close: '19:00', closed: false },
  { day: 'Saturday', open: '10:00', close: '17:00', closed: false },
  { day: 'Sunday', open: '', close: '', closed: true },
]

export const promotions: Promotion[] = [
  { id: 'pr1', title: 'Detty December early access', code: 'DETTY15', discount: '15% off', ends: '2026-12-01', active: true },
  { id: 'pr2', title: 'Free delivery weekend', code: 'FREESHIP', discount: 'Free delivery', ends: '2026-10-12', active: true },
  { id: 'pr3', title: 'Back to school', code: 'SCHOOL10', discount: '10% off', ends: '2026-09-20', active: false },
]

export const conversations: Conversation[] = [
  {
    id: 'c1',
    customer: 'Tolu Adebayo',
    channel: 'Website chat',
    unread: 2,
    resolved: false,
    messages: [
      { id: 'm1', from: 'customer', text: 'Hi, is the indigo kaftan available in L?', at: ago(16) },
      { id: 'm2', from: 'assistant', text: 'Yes, the Indigo Adire Kaftan is in stock in L. It’s ₦38,000.', products: ['p1'], at: ago(16) },
      { id: 'm3', from: 'customer', text: 'How much is delivery to Ikeja?', at: ago(14) },
      { id: 'm4', from: 'assistant', text: 'Delivery within Lagos is ₦3,000 and takes 1 to 2 working days.', at: ago(14) },
      { id: 'm5', from: 'customer', text: 'Ok placing the order now', at: ago(12) },
    ],
  },
  {
    id: 'c2',
    customer: 'Chiamaka Obi',
    channel: 'WhatsApp',
    unread: 0,
    resolved: true,
    messages: [
      { id: 'm1', from: 'customer', text: 'Where is my order MRA-2040?', at: ago(100) },
      { id: 'm2', from: 'assistant', text: 'Order MRA-2040 has shipped and should arrive within 3 to 5 working days.', at: ago(100) },
    ],
  },
  {
    id: 'c3',
    customer: 'Visitor 4821',
    channel: 'Website chat',
    unread: 1,
    resolved: false,
    messages: [
      { id: 'm1', from: 'customer', text: 'When will the Aso-Oke clutch be back?', at: ago(30) },
      { id: 'm2', from: 'assistant', text: 'The Aso-Oke Clutch is sold out right now. I’ve let the team know you’re interested. They’ll confirm a restock date.', products: ['p3'], at: ago(30) },
    ],
  },
  {
    id: 'c4',
    customer: 'Funke Ojo',
    channel: 'Instagram',
    unread: 0,
    resolved: false,
    messages: [
      { id: 'm1', from: 'customer', text: 'Do you do pay on delivery?', at: ago(9) },
      { id: 'm2', from: 'assistant', text: 'Pay on delivery is available within Lagos. Elsewhere you can pay by card, transfer or USSD.', at: ago(9) },
    ],
  },
]
