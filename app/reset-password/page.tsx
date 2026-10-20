"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Reached from the emailed link: /auth/callback exchanges the code for a session and
// forwards here, so a signed-in user on this page is someone who just proved they own
// the inbox. Without a session there is nothing to reset, so we say so.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "yes" | "no">("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const { data } = await createClient().auth.getUser();
        if (active) setReady(data.user ? "yes" : "no");
      } catch {
        if (active) setReady("no");
      }
    };
    void check();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || "Unable to update your password.");
        return;
      }
      setDone(true);
      setTimeout(() => {
        router.push("/portal");
        router.refresh();
      }, 1200);
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-12 text-slate-900">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.35),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(165,243,252,0.4),transparent_42%)]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="text-sm font-semibold tracking-tight text-slate-600 transition hover:text-accent">
            Mira <span className="font-normal text-accent">for Business</span>
          </Link>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">Choose a new password</h1>
        </div>

        <div className="rounded-4xl border border-white/80 bg-white/65 p-7 shadow-2xl shadow-sky-200/60 backdrop-blur-2xl sm:p-8">
          {ready === "checking" && <p className="text-center text-sm text-slate-500">One moment…</p>}

          {ready === "no" && (
            <div className="space-y-4 text-center" role="alert">
              <p className="text-sm leading-6 text-slate-600">This reset link has expired or was already used. Request a new one and try again.</p>
              <Link
                href="/forgot-password"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-200/70 transition hover:bg-accent-dark"
              >
                Request a new link
              </Link>
            </div>
          )}

          {ready === "yes" && done && (
            <p className="text-center text-sm font-medium text-slate-900" role="status">
              Password updated. Taking you to your dashboard…
            </p>
          )}

          {ready === "yes" && !done && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="field-password" className="block text-sm font-medium text-slate-700">New password</label>
                <input
                  id="field-password"
                  type="password"
                  autoComplete="new-password"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-accent focus:outline-hidden focus:ring-4 focus:ring-accent/15"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="field-confirm" className="block text-sm font-medium text-slate-700">Confirm new password</label>
                <input
                  id="field-confirm"
                  type="password"
                  autoComplete="new-password"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-accent focus:outline-hidden focus:ring-4 focus:ring-accent/15"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-200/70 transition hover:bg-accent-dark disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Save new password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
