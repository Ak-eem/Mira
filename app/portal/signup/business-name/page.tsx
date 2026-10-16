"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Reached only from app/auth/callback/route.ts, for a Google sign-in whose
// account has no business yet. A password signup (app/portal/signup)
// collects this before the account even exists; Google skips straight to
// an authenticated session, so this is where that one missing step happens
// -- same provision_new_business RPC either way.
export default function BusinessNamePage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!businessName.trim()) {
      setError("Enter your business name.");
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
      const { error: provisionError } = await supabase.rpc("provision_new_business", {
        p_name: businessName.trim(),
        p_owner_id: user.id,
      });
      if (provisionError) {
        setError(
          provisionError.message === "TRIAL_ALREADY_USED"
            ? "This account has already used its free trial. Contact us to set up billing."
            : "We couldn't set up your business automatically. Contact support.",
        );
        return;
      }
      router.push("/portal/signup/complete");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error && submitError.message ? submitError.message : "Unable to set up your business");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-12 text-slate-900">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.35),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(165,243,252,0.4),transparent_42%)]" />
      <div className="relative w-full max-w-sm">
        <h1 className="mb-8 text-center text-2xl font-semibold tracking-tight text-slate-900">
          Mira <span className="font-normal text-accent">for Business</span>
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-4xl border border-white/80 bg-white/65 p-7 shadow-2xl shadow-sky-200/60 backdrop-blur-2xl sm:p-8">
          <div>
            <label htmlFor="field-one-last-step-your-business-na" className="block text-sm font-medium text-slate-700">One last step: your business name</label>
            <input id="field-one-last-step-your-business-na"
              type="text"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-accent focus:outline-hidden focus:ring-4 focus:ring-accent/15"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-200/70 transition hover:bg-accent-dark disabled:opacity-50"
          >
            {submitting ? "Setting up…" : "Continue"}
          </button>
        </form>
      </div>
    </main>
  );
}
