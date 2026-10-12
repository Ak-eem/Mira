import Link from "next/link";
import { BUSINESS_ADDRESS, BUSINESS_LEGAL_NAME, CONTACT_EMAIL } from "@/lib/site/business";

export const metadata = {
  title: "Contact | Mira",
  description: `Contact details for Mira, operated by ${BUSINESS_LEGAL_NAME}.`,
};

export default function ContactPage() {
  return (
    <main className="bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-4xl px-6 pb-16 pt-6 sm:px-8">
        <nav className="flex items-center justify-between rounded-full border border-white/70 bg-white/55 px-4 py-3 shadow-xs backdrop-blur-xl">
          <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
            Mira <span className="font-normal text-accent">for Business</span>
          </Link>
          <Link href="/" className="text-sm font-medium text-slate-600 transition hover:text-accent">Back to Home</Link>
        </nav>

        <article className="mt-8 rounded-4xl border border-white/80 bg-white/75 p-8 shadow-xl shadow-sky-100/60 backdrop-blur-2xl sm:p-12">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Contact us</h1>
          <p className="mt-3 text-slate-600">Mira is operated by {BUSINESS_LEGAL_NAME}.</p>

          <dl className="mt-8 space-y-6">
            <div>
              <dt className="text-sm font-semibold text-slate-500">Business name</dt>
              <dd className="mt-1 text-slate-900">{BUSINESS_LEGAL_NAME}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-slate-500">Registered address</dt>
              <dd className="mt-1 text-slate-900">
                <address className="not-italic">{BUSINESS_ADDRESS}</address>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-slate-500">Email</dt>
              <dd className="mt-1">
                <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-accent underline-offset-4 hover:underline">{CONTACT_EMAIL}</a>
              </dd>
            </div>
          </dl>
        </article>
      </div>
    </main>
  );
}
