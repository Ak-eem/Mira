# Mira

> AI-powered customer service for any business

Mira is a vertical-agnostic AI customer-service platform for any business that talks to customers. It helps SMEs, banks, schools, clinics, hospitals, restaurants, fashion stores, and other businesses provide fast, grounded, multilingual support. Each business gets an AI refined for its industry and grounded in that business's own data. Dressence, a fashion store, is one demo tenant—not Mira's only target market.

## Features

- Per-business AI grounded in that business's data
- WhatsApp Cloud API and embeddable web chat widget
- Products catalog with stock-aware answers
- Orders: Mira records orders customers place in chat (on by default for new businesses; each order waits for staff confirmation) and answers status questions from those records. It does not take payment or arrange delivery.
- Business insights dashboard
- Multi-language responses and loose product-name matching, both handled by the underlying LLM's own language and semantic understanding rather than a dedicated translation or fuzzy-search engine
- Row-level security (RLS) for tenant isolation
- Groq + Gemini fallback for resilient AI responses

## Tech stack

- Next.js 16 App Router
- React
- TypeScript
- Tailwind CSS
- Supabase Postgres + Auth
- Gemini 3.6 Flash
- Groq / openai/gpt-oss-120b
- Vercel

## Documentation

- `docs/deployment.md`: going live, step by step (Supabase, Vercel, email, Paystack, WhatsApp)
- `docs/owner-guide.md`: a plain-language guide for business owners
- `docs/costs.md`: what running Mira costs, including WhatsApp message fees
- `docs/paystack-setup.md`, `docs/alerts.md`, `docs/data-retention.md`

## Live demo

https://mira-eight-tau.vercel.app/

## Quick start

```bash
git clone https://github.com/Ak-eem/Mira.git
cd Mira
npm install
```

Create `.env.local` in the project root and add the required environment variables — see `.env.example` for the full, authoritative list. At minimum, for local development:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
AI_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key
LLM_API_KEY=your_gemini_api_key
```

WhatsApp and cron-related variables are only required if you're testing those integrations locally — see `.env.example`.

Then start the development server:

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

## Architecture highlights

- A multi-tenant foundation separates each business's data, configuration, catalog, orders, and conversations.
- Retrieval and response generation are grounded in business-specific data so the AI can be refined for each vertical without making Mira industry-specific.
- WhatsApp Cloud API and the web chat widget provide customer-facing channels, while dashboards give businesses operational and insight tooling.
- Supabase Postgres, Auth, and RLS enforce tenant isolation at the data layer.
- Gemini and Groq provide complementary model paths, with fallback for more resilient responses.

## License

No open-source license has been declared yet. Unless a license is added to this repository, all rights are reserved by the copyright holder.

> **UNVERIFIED:** `design-integration` is UNVERIFIED; no build/lint/test run; local validation required before merge.
