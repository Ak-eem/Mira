import Link from "next/link";

export const metadata = {
  title: "Terms of Service | Mira for Business",
  description: "Terms of Service and Subscription Agreement for Mira AI platform.",
};

export default function TermsOfServicePage() {
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
              This Terms of Service document is an initial draft designed for early-stage operational guidance. It must be formally reviewed and finalized by a licensed legal counsel before being relied upon as a legally binding contract.
            </p>
          </div>

          {/* Content Card */}
          <article className="mt-8 rounded-[2rem] border border-white/80 bg-white/75 p-8 shadow-xl shadow-sky-100/60 backdrop-blur-2xl sm:p-12">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Terms of Service
            </h1>
            <p className="mt-2 text-xs font-medium uppercase tracking-wider text-slate-400">
              Last updated: September 2026
            </p>

            <div className="mt-8 space-y-8 text-sm leading-7 text-slate-600">
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">1. Acceptance of Terms</h2>
                <p>
                  By creating an account, accessing, or using the Mira platform (&quot;Service&quot;), subscribing businesses (&quot;Subscriber,&quot; &quot;you,&quot; or &quot;your&quot;) agree to be bound by these Terms of Service. If you are entering into these terms on behalf of a company or entity, you represent that you have the authority to bind that entity.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">2. Acceptable Use Policy</h2>
                <p>
                  Mira provides AI-driven customer assistant tools over web widgets and WhatsApp integrations. Subscribers agree to use the Service in compliance with all applicable local and international laws.
                </p>
                <p>Subscribers must NOT use the Service to:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Send unsolicited promotional messages (spam) or violate Meta/WhatsApp Business Platform policies.</li>
                  <li>Transmit unlawful, defamatory, fraudulent, deceptive, or abusive content to customers.</li>
                  <li>Impersonate any person, government entity, or business without authorization.</li>
                  <li>Upload false, misleading, or illegal knowledge base material designed to trick or harm consumers.</li>
                  <li>Attempt to probe, scan, reverse engineer, or breach the security of the Mira platform.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">3. Subscriptions, Fees &amp; Renewals</h2>
                <p>
                  Mira is offered on a subscription basis (monthly or annual billing cycles). Subscriptions automatically renew at the end of each billing period unless cancelled prior to the renewal date via the business dashboard.
                </p>
                <p>
                  Fees are non-refundable except where required by applicable law or specifically agreed upon in writing. We reserve the right to adjust pricing or modify feature tiers upon providing reasonable advance notice.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">4. Service Limitations &amp; AI Disclaimer</h2>
                <p>
                  Mira utilizes artificial intelligence language models to generate automated responses based on knowledge uploaded by Subscribers. While we strive for high reliability and accuracy:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    AI responses are provided on an <strong>&quot;AS IS&quot;</strong> and <strong>&quot;AS AVAILABLE&quot;</strong> basis.
                  </li>
                  <li>
                    Subscribers are responsible for reviewing and maintaining accurate knowledge base information (prices, business hours, policies).
                  </li>
                  <li>
                    Mira does not guarantee that AI responses will be error-free in 100% of scenarios. Subscribers are encouraged to utilize human takeover features for sensitive transactions.
                  </li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">5. Limitation of Liability</h2>
                <p>
                  To the maximum extent permitted by Nigerian law, Mira and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, revenue, customer goodwill, or data, arising out of or in connection with the use or inability to use the Service.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">6. Cancellation &amp; Data Handling Upon Termination</h2>
                <p>
                  Subscribers may cancel their account subscription at any time through the business portal settings.
                </p>
                <p>
                  Upon cancellation:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Your active access to AI response generation will terminate at the end of your current billing period.</li>
                  <li>Subscribers may request an export of their customer conversation logs and knowledge base within 30 days of cancellation.</li>
                  <li>After the 30-day grace period, all business knowledge data, uploaded catalogs, and associated customer chat histories will be permanently deleted from active production systems.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">7. Governing Law</h2>
                <p>
                  These Terms of Service are governed by and construed in accordance with the laws of the Federal Republic of Nigeria.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">8. Contact Us</h2>
                <p>
                  For inquiries regarding these Terms of Service or subscription management, please contact support@mira.ng.
                </p>
              </section>
            </div>
          </article>
        </div>
      </div>
    </main>
  );
}
