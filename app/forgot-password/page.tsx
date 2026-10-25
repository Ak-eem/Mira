"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      // Rate limits are worth telling the visitor about. Anything else is answered the
      // same way whether or not the address has an account, so this page can't be used
      // to find out who is registered.
      if (resetError && /rate limit|too many|seconds/i.test(resetError.message)) {
        setError("Too many requests. Wait a minute and try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12 text-slate-900">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.35),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(165,243,252,0.4),transparent_42%)]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="text-sm font-semibold tracking-tight text-slate-600 transition hover:text-accent">
            Mira <span className="font-normal text-accent">for Business</span>
          </Link>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">Reset your password</h1>
        </div>

        <div className="ui-card ui-enter !p-6 sm:!p-8">
          {sent ? (
            <div className="space-y-3 text-center" role="status">
              <p className="text-sm font-medium text-slate-900">Check your inbox</p>
              <p className="text-sm leading-6 text-slate-600">
                If an account exists for <span className="font-medium text-slate-800">{email.trim()}</span>, we&apos;ve sent a link to choose a new password. It can take a minute to arrive. Check spam if you don&apos;t see it.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm leading-6 text-slate-600">Enter the email you signed up with and we&apos;ll send you a link to choose a new password.</p>
              <div>
                <label htmlFor="field-email" className="ui-label">Email</label>
                <input
                  id="field-email"
                  type="email"
                  autoComplete="email"
                  className="ui-field"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="ui-btn ui-btn-primary w-full"
              >
                {submitting ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-sm text-slate-500">
          <Link href="/login" className="font-semibold text-accent transition hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
