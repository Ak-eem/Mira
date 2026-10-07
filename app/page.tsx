import { ChatWidget } from "@/components/site/chat";
import { Hero } from "@/components/site/hero";
import { Features, Footer, Industries, Nav, Pricing, Steps } from "@/components/site/landing";

export default function Home() {
  // Same price the checkout charges (set in Vercel), so the page never drifts from billing.
  const price = Number(process.env.PAYSTACK_BASE_AMOUNT_NGN) || 50000;
  return (
    <div
      className="min-h-dvh"
      style={{
        background: "var(--color-canvas)",
        color: "var(--color-ink)",
        fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div className="relative min-h-dvh overflow-x-clip bg-surface sm:m-3 sm:rounded-[32px]">
        {/* Frosted glass band across the top, so the page blurs softly beneath the nav */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-30 h-28 bg-gradient-to-b from-white/65 via-white/35 to-transparent backdrop-blur-xl backdrop-saturate-150 max-sm:backdrop-blur-lg"
          style={{ maskImage: "linear-gradient(#000 60%, transparent)", WebkitMaskImage: "linear-gradient(#000 60%, transparent)" }}
        />
        <Nav />
        <main className="relative">
          <Hero price={price} />
          <Industries />
          <Features />
          <Steps />
          <Pricing price={price} />
        </main>
        <Footer />
      </div>
      <ChatWidget />
    </div>
  );
}
