import { ChatWidget } from "@/components/site/chat";
import { Hero } from "@/components/site/hero";
import { Features, Footer, Industries, Nav, Preloader, Pricing, Steps } from "@/components/site/landing";

export default function Home() {
  return (
    <div
      className="min-h-dvh"
      style={{
        background: "var(--color-canvas)",
        color: "var(--color-ink)",
        fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <Preloader />
      <div className="relative min-h-dvh overflow-x-clip bg-surface sm:m-3 sm:rounded-[32px]">
        <Nav />
        <main className="relative">
          <Hero />
          <Industries />
          <Features />
          <Steps />
          <Pricing />
        </main>
        <Footer />
      </div>
      <ChatWidget />
    </div>
  );
}
