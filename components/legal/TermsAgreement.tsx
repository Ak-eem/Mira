"use client";

import Link from "next/link";
import { OWNERSHIP_STATEMENT } from "@/lib/legal";

// The required checkbox shown on every signup path. The wording comes from lib/legal.ts so what the person reads is
// exactly what is stored with their acceptance.
export function TermsAgreement({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-700 ring-1 ring-slate-200/80">
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-accent"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        required
      />
      <span>
        {OWNERSHIP_STATEMENT} I agree to the{" "}
        <Link href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
          Privacy Policy
        </Link>
        .
      </span>
    </label>
  );
}
