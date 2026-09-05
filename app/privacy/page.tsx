import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Mira for Business",
  description: "Privacy Policy and NDPR compliance details for Mira AI platform.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {/* Background Gradient */}
      <div className="relative isolate">
        <div className="hero-ambient absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(circle_at_top_left,_rgba(125,211,252,0.35),_transparent_48%),radial-gradient(circle_at_top_right,_rgba(165,243,252,0.4),_transparent_42%)]" />

        <div className="mx-auto max-w-4xl px-6 pb-20 pt-6 sm:px-8">
          {/* Header Navigation */}
          <nav className="flex items-center justify-between rounded-full border border-white/70 bg-white/55 px-4 py-3 shadow-sm shadow-sky-100/70 backdrop-blur-xl sm:px-6">
            <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
              Mira <span className="font-normal text-accent">for Business</span>
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/" className="font-medium text-slate-600 transition hover:text-accent">
                Back to Home
              </Link>
            </div>
          </nav>

          {/* Legal Draft Notice */}
          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 shadow-sm backdrop-blur">
            <p className="font-semibold">⚠️ Legal Disclaimer Notice</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              This Privacy Policy is a starting draft provided for operational clarity for an early-stage SaaS product. It must be formally reviewed and tailored by a qualified Nigerian legal professional before being relied upon for strict legal compliance.
            </p>
          </div>

          {/* Content Card */}
          <article className="mt-8 rounded-[2rem] border border-white/80 bg-white/75 p-8 shadow-xl shadow-sky-100/60 backdrop-blur-2xl sm:p-12">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Privacy Policy
            </h1>
            <p className="mt-2 text-xs font-medium uppercase tracking-wider text-slate-400">
              Last updated: September 2026
            </p>

            <div className="mt-8 space-y-8 text-sm leading-7 text-slate-600">
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">1. Overview &amp; Role as Data Processor</h2>
                <p>
                  Mira (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) operates a multi-tenant AI customer service platform designed for businesses in Nigeria and internationally. Our platform assists subscribing businesses in communicating with their customers via WhatsApp, web chat widgets, and other supported integration channels.
                </p>
                <p>
                  Under the <strong>Nigeria Data Protection Act (NDPA)</strong> and the <strong>Nigeria Data Protection Regulation (NDPR)</strong>:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    <strong>Subscribing Businesses</strong> act as <em>Data Controllers</em>, determining the purposes and means of communicating with their end customers.
                  </li>
                  <li>
                    <strong>Mira</strong> acts as a <em>Data Processor</em>, processing end-customer data strictly on behalf of and according to the instructions of the subscribing business.
                  </li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">2. Information We Process</h2>
                <p>Depending on how a business configures Mira, we collect and process the following information:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    <strong>Customer Communications &amp; Messages:</strong> The text, inquiries, and chat logs exchanged between end-customers and the AI assistant or business agents.
                  </li>
                  <li>
                    <strong>Contact Identifiers:</strong> Phone numbers (for WhatsApp messages), email addresses, or anonymous visitor session identifiers (for web chat widgets).
                  </li>
                  <li>
                    <strong>Order &amp; Inquiry Data:</strong> Details regarding product inquiries, appointment bookings, price checks, or order requests submitted through the chat interface.
                  </li>
                  <li>
                    <strong>Business Account Information:</strong> Account credentials, business profiles, knowledge base uploads (FAQs, product catalogs, service lists), and billing contact details for subscribing business owners.
                  </li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">3. How Data Is Used</h2>
                <p>We process data solely to provide and improve our service, including:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Generating automated, context-aware AI replies to customer questions.</li>
                  <li>Routing messages to business owners when human intervention or follow-up is requested.</li>
                  <li>Maintaining audit logs, usage analytics, and conversation histories for subscribing businesses.</li>
                  <li>Ensuring platform security, preventing abuse, and troubleshooting technical issues.</li>
                </ul>
                <p>We do <strong>not</strong> sell end-customer data or business knowledge bases to third parties.</p>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">4. Data Retention &amp; Storage</h2>
                <p>
                  Data is stored securely using cloud infrastructure provider Supabase, employing row-level security (RLS) policies to ensure complete multi-tenant data isolation between subscribing businesses.
                </p>
                <p>
                  We retain conversation history and customer interactions for as long as the subscribing business maintains an active account with Mira. If a business cancels its subscription or requests account deletion, data is retained for a brief grace period (up to 30 days) before permanent deletion from active databases, unless longer retention is required by applicable law.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">5. NDPR Rights &amp; Data Protection Principles</h2>
                <p>
                  We adhere to key NDPR data protection principles including lawfulness, transparency, purpose limitation, and data minimization. End-customers wishing to access, correct, or request deletion of personal information stored within a business&apos;s Mira assistant should direct their requests to the relevant subscribing business (the Data Controller). Mira will assist the business in fulfilling valid data subject requests.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">6. Contact Information</h2>
                <p>
                  If you have questions regarding this Privacy Policy or Mira&apos;s data processing practices, please contact us through your business dashboard or by emailing privacy@mira.ng.
                </p>
              </section>
            </div>
          </article>
        </div>
      </div>
    </main>
  );
}
