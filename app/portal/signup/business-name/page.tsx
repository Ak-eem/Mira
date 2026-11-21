"use client";

import { BusinessTypeChoice } from "@/components/signup/BusinessTypeChoice";
import { applyBusinessType } from "@/lib/signupBusinessType";
import type { BusinessType } from "@/lib/businessTypes";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TermsAgreement } from "@/components/legal/TermsAgreement";
import { AGREEMENT_REQUIRED_MESSAGE, TERMS_VERSION, forgetAgreement, readRememberedAgreement } from "@/lib/legal";

// The browser remembers a tick made on the signup page (see lib/legal.ts). Read through useSyncExternalStore so the
// server render and the first client render agree, then it flips to what is really stored.
const subscribeNothing = () => () => {};

// Reached only from app/auth/callback/route.ts, for a Google sign-in whose
// account has no business yet. A password signup (app/portal/signup)
// collects this before the account even exists; Google skips straight to
// an authenticated session, so this is where that one missing step happens
// -- same provision_new_business RPC either way.
export default function BusinessNamePage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType>("general");
  const [agreed, setAgreed] = useState(false);
  const alreadyAgreed = useSyncExternalStore(subscribeNothing, () => readRememberedAgreement() !== null, () => false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!businessName.trim()) {
      setError("Enter your business name.");
      return;
    }
    // Either they ticked on the signup page (remembered in this browser) or they tick it here.
    const remembered = readRememberedAgreement();
    if (!remembered && !agreed) {
      setError(AGREEMENT_REQUIRED_MESSAGE);
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/portal/login");
        return;
      }
      // Record the agreement first; provision_new_business refuses to create a business without it.
      const { error: agreementError } = await supabase.rpc("record_terms_acceptance", {
        p_terms_version: TERMS_VERSION,
        p_source: remembered?.source ?? "business_name",
      });
      if (agreementError) {
        setError("We couldn't record your agreement. Please try again, or contact support.");
        return;
      }
      const { data: newBusinessId, error: provisionError } = await supabase.rpc("provision_new_business", {
        p_name: businessName.trim(),
        p_owner_id: user.id,
      });
      if (provisionError) {
        setError(
          provisionError.message === "TRIAL_ALREADY_USED"
            ? "This account has already used its free trial. Contact us to set up billing."
            : provisionError.message === "TERMS_NOT_ACCEPTED"
              ? AGREEMENT_REQUIRED_MESSAGE
              : "We couldn't set up your business automatically. Contact support.",
        );
        return;
      }
      await applyBusinessType(supabase, newBusinessId, businessType);
      forgetAgreement();
      router.push("/portal/signup/complete");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error && submitError.message ? submitError.message : "Unable to set up your business");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 py-12 text-slate-900">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.35),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(165,243,252,0.4),transparent_42%)]" />
      <div className="relative w-full max-w-sm">
        <h1 className="mb-8 text-center text-2xl font-semibold tracking-tight text-slate-900">
          Mira <span className="font-normal text-accent">for Business</span>
        </h1>

        <form onSubmit={handleSubmit} className="ui-card ui-enter space-y-4 !p-6 sm:!p-8">
          <div>
            <label htmlFor="field-one-last-step-your-business-na" className="ui-label">One last step: your business name</label>
            <input id="field-one-last-step-your-business-na"
              type="text"
              className="ui-field"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <BusinessTypeChoice value={businessType} onChange={setBusinessType} />

          {alreadyAgreed ? (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 ring-1 ring-slate-200/80">
              You confirmed you own this business and agreed to the Terms of Service and Privacy Policy when you signed up.
            </p>
          ) : (
            <TermsAgreement checked={agreed} onChange={setAgreed} />
          )}

          {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={submitting || (!alreadyAgreed && !agreed)}
            className="ui-btn ui-btn-primary w-full"
          >
            {submitting ? "Setting up…" : "Create my dashboard"}
          </button>
        </form>
      </div>
    </main>
  );
}
