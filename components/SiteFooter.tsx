import Link from "next/link";
import { BUSINESS_ADDRESS, BUSINESS_LEGAL_NAME } from "@/lib/site/business";
import { CurrentYear } from "./CurrentYear";

// Public footer: who operates Mira and where they are registered. Shown on every public page (see FooterGate).
export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 text-sm text-slate-600">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-8 sm:px-8 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="font-medium text-slate-800">Mira is operated by {BUSINESS_LEGAL_NAME}</p>
          <p>
            <span className="text-slate-500">Registered address:</span> {BUSINESS_ADDRESS}
          </p>
          <p className="text-slate-500">
            &copy; <CurrentYear /> {BUSINESS_LEGAL_NAME}. All rights reserved.
          </p>
        </div>
        <nav aria-label="Footer" className="flex gap-5 font-medium">
          <Link href="/contact" className="transition hover:text-accent">Contact</Link>
          <Link href="/terms" className="transition hover:text-accent">Terms</Link>
          <Link href="/privacy" className="transition hover:text-accent">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}
