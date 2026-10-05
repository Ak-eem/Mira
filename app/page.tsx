import Link from "next/link";
import { ChatWindow } from "./chat/[businessSlug]/ChatWindow";
import { ScrollReveal } from "./components/scroll-reveal";

const features = [
  {
    title: "Answers from your own data",
    description: "Prices, stock, delivery and opening hours, answered in seconds. Mira only says what your business has told it.",
  },
  {
    title: "Hands off to you",
    description: "When a customer needs a person, Mira flags the chat and you step in. Hand it back whenever you like.",
  },
  {
    title: "Orders and follow-ups",
    description: "Take orders in chat and follow up with people who showed interest, so fewer sales slip away.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-slate-50 text-slate-900">
      <div className="relative isolate">
        <div className="hero-ambient absolute inset-x-0 top-0 -z-10 h-136 bg-[radial-gradient(circle_at_top_left,rgba(246,213,107,0.38),transparent_48%),radial-gradient(circle_at_top_right,rgba(207,220,203,0.55),transparent_42%)]" />
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-6 sm:px-8 lg:px-10">
          <nav className="flex items-center justify-between rounded-full border border-white/70 bg-white/55 px-4 py-3 shadow-xs shadow-slate-900/5 backdrop-blur-xl sm:px-6">
            <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
              Mira<span className="text-marigold">.</span>
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/login" className="font-medium text-slate-600 transition hover:text-accent">
                Login
              </Link>
              <Link
                href="/signup"
                className="hidden rounded-full bg-accent px-4 py-2 font-medium text-white shadow-lg shadow-slate-900/15 transition hover:bg-accent-dark sm:inline-flex"
              >
                Get started
              </Link>
            </div>
          </nav>

          <section className="grid items-center gap-12 pb-16 pt-20 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 lg:pt-28">
            <ScrollReveal delay={80}>
              <div>
                <p className="mb-6 inline-flex rounded-full border border-cyan-200/80 bg-white/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent-dark shadow-xs backdrop-blur-sm">
                  Customer service, always on
                </p>
                <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
                  Your front desk that never sleeps.
                </h1>
                <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
                  Mira answers your customers on WhatsApp, email and your website, using your own products, prices and policies, and hands the conversation to you when it should.
                </p>
                <div className="mt-9 flex flex-wrap items-center gap-4">
                  <Link
                    href="/signup"
                    className="cta-glow inline-flex items-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-slate-900/15 transition hover:bg-accent-dark"
                  >
                    Get started
                    <span aria-hidden="true" className="ml-2">→</span>
                  </Link>
                  <Link href="/login" className="text-sm font-semibold text-slate-600 transition hover:text-accent">
                    Admin login
                  </Link>
                </div>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={180} className="relative mx-auto w-full max-w-md">
              <div className="absolute -inset-6 rounded-[2.5rem] bg-cyan-200/30 blur-3xl" />
              <div className="relative rounded-4xl border border-white/80 bg-white/60 p-5 shadow-2xl shadow-slate-900/10 backdrop-blur-2xl">
                <ChatWindow
                  businessSlug="mira"
                  businessName="Mira"
                  openNow={true}
                  embedMode
                />
                <div className="mt-6 flex items-center justify-center gap-4">
                  <Link
                    href="/signup"
                    className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/15 transition hover:bg-accent-dark"
                  >
                    Get started
                  </Link>
                  <span className="text-xs font-medium text-slate-500">Try the live demo</span>
                </div>
              </div>
            </ScrollReveal>
          </section>
        </div>
      </div>

      <section className="mx-auto max-w-6xl px-6 pb-20 sm:px-8 lg:px-10">
        <div className="grid gap-5 md:grid-cols-3">
          {features.map((feature, index) => (
            <ScrollReveal key={feature.title} delay={index * 90} className="h-full">
              <article className="feature-card h-full rounded-3xl border border-white/80 bg-white/65 p-6 shadow-lg shadow-slate-900/5 backdrop-blur-xl">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-100 text-sm font-bold text-accent-dark">
                  {index + 1}
                </span>
                <h2 className="mt-6 text-lg font-semibold text-slate-900">{feature.title}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">{feature.description}</p>
              </article>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal delay={120} className="mt-20">
          <div className="overflow-hidden rounded-4xl border border-cyan-100 bg-linear-to-br from-cyan-100 via-white to-slate-100 px-6 py-12 text-center shadow-xl shadow-slate-900/5 sm:px-12">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-dark">Ready when you are</p>
            <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Let every customer feel looked after, day and night.
            </h2>
            <Link
              href="/signup"
              className="cta-glow mt-8 inline-flex rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/15 transition hover:bg-accent-dark"
            >
              Get started
            </Link>
          </div>
        </ScrollReveal>
      </section>

      <footer className="mx-auto max-w-6xl border-t border-slate-200/80 px-6 py-8 text-xs text-slate-500 sm:px-8 lg:px-10">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p>© {new Date().getFullYear()} Mira. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="font-medium text-slate-600 transition hover:text-accent">
              Privacy Policy
            </Link>
            <Link href="/terms" className="font-medium text-slate-600 transition hover:text-accent">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
