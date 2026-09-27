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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <p className="mb-8 text-center text-xl font-semibold tracking-tight text-slate-900">
          Mira <span className="font-normal text-accent">for Business</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-slate-700">One last step: your business name</label>
            <input
              type="text"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
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
            className="w-full rounded bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
          >
            {submitting ? "Setting up…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
