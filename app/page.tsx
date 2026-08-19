import Link from "next/link";
import { ScrollReveal } from "./components/scroll-reveal";

const features = [
  {
    title: "Answer every customer",
    description: "Give people fast, helpful answers across the channels where they already reach you.",
  },
  {
    title: "Teach Mira your business",
    description: "Keep products, services, policies, FAQs, and hours in one calm, editable knowledge base.",
  },
  {
    title: "Follow up with confidence",
    description: "Spot conversations that need a human touch and turn customer interest into the next step.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-slate-50 text-slate-900">
      <div className="relative isolate">
        <div className="hero-ambient absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(circle_at_top_left,_rgba(125,211,252,0.42),_transparent_48%),radial-gradient(circle_at_top_right,_rgba(165,243,252,0.5),_transparent_42%)]" />
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-6 sm:px-8 lg:px-10">
          <nav className="flex items-center justify-between rounded-full border border-white/70 bg-white/55 px-4 py-3 shadow-sm shadow-sky-100/70 backdrop-blur-xl sm:px-6">
            <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
              Mira <span className="font-normal text-accent">for Business</span>
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/login" className="font-medium text-slate-600 transition hover:text-accent">
                Admin login
              </Link>
              <Link
                href="/signup"
                className="hidden rounded-full bg-accent px-4 py-2 font-medium text-white shadow-lg shadow-cyan-200/60 transition hover:bg-accent-dark sm:inline-flex"
              >
                Get started
              </Link>
            </div>
          </nav>

          <section className="grid items-center gap-12 pb-16 pt-20 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 lg:pt-28">
            <ScrollReveal delay={80}>
              <div>
                <p className="mb-6 inline-flex rounded-full border border-cyan-200/80 bg-white/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent-dark shadow-sm backdrop-blur">
                  A calmer way to grow
                </p>
                <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
                  Your business, always ready to help.
                </h1>
                <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
                  Mira helps businesses turn customer questions into clear answers, thoughtful follow-ups, and better everyday operations.
                </p>
                <div className="mt-9 flex flex-wrap items-center gap-4">
                  <Link
                    href="/signup"
                    className="cta-glow inline-flex items-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-cyan-200/70 transition hover:bg-accent-dark"
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
              <div className="relative rounded-[2rem] border border-white/80 bg-white/60 p-5 shadow-2xl shadow-sky-200/60 backdrop-blur-2xl">
                <div className="hero-surface rounded-[1.5rem] border border-sky-100 bg-gradient-to-br from-white via-sky-50 to-cyan-100 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Mira assistant</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">A helpful answer, every time.</p>
                    </div>
                    <span className="h-3 w-3 rounded-full bg-cyan-400 shadow-lg shadow-cyan-300" />
                  </div>
                  <div className="mt-8 space-y-3 text-sm">
                    <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-slate-900 px-4 py-3 text-white shadow-sm">
                      Do you have this service available today?
                    </div>
                    <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-cyan-100 bg-white px-4 py-3 leading-6 text-slate-600 shadow-sm">
                      Yes — Mira can share your hours, answer the key details, and guide them to the next step.
                    </div>
                  </div>
                  <div className="mt-8 flex items-center gap-2 text-xs font-medium text-slate-500">
                    <span className="h-2 w-2 rounded-full bg-accent" />
                    Connected to your business knowledge
                  </div>
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
              <article className="feature-card h-full rounded-3xl border border-white/80 bg-white/65 p-6 shadow-lg shadow-sky-100/80 backdrop-blur-xl">
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
          <div className="overflow-hidden rounded-[2rem] border border-cyan-100 bg-gradient-to-br from-sky-100 via-white to-cyan-100 px-6 py-12 text-center shadow-xl shadow-sky-100/80 sm:px-12">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-dark">Ready when you are</p>
            <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Make every customer conversation feel effortless.
            </h2>
            <Link
              href="/signup"
              className="cta-glow mt-8 inline-flex rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-200/70 transition hover:bg-accent-dark"
            >
              Get started
            </Link>
          </div>
        </ScrollReveal>
      </section>
    </main>
  );
}
