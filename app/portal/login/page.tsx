"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import GoogleAuthButton from "@/app/components/GoogleAuthButton";

function getSafeRedirect(search: string) {
  const next = new URLSearchParams(search).get("next");

  // Only allow same-origin paths. In particular, reject protocol-relative URLs.
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/portal";
  }

  return next;
}

function getLoginErrorMessage(message?: string | null) {
  if (message?.toLowerCase().includes("email not confirmed")) {
    return "Your email address is not confirmed. Check your inbox for the confirmation link before signing in.";
  }

  return message || "Unable to sign in. Check your email and password and try again.";
}

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setError(getLoginErrorMessage(error.message));
        return;
      }

      const next = getSafeRedirect(window.location.search);
      router.replace(next);
      router.refresh();
    } catch {
      setError("Unable to sign in right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12 text-slate-900">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.35),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(165,243,252,0.4),transparent_42%)]" />
      <div className="relative w-full max-w-sm">
        <h1 className="mb-8 text-center text-2xl font-semibold tracking-tight text-slate-900">
          Mira <span className="font-normal text-accent">for Business</span>
          <span className="mt-1 block text-sm font-normal text-slate-600">Log in to your account</span>
        </h1>

        <div className="ui-card ui-enter space-y-4 !p-6 sm:!p-8">
          <GoogleAuthButton next={getSafeRedirect(typeof window !== "undefined" ? window.location.search : "")} />

          <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span className="h-px flex-1 bg-slate-200" />
            or
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="field-email" className="ui-label">Email</label>
            <input id="field-email"
              type="email"
              className="ui-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="field-password" className="ui-label">Password</label>
            <input id="field-password"
              type="password"
              className="ui-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="-mt-2 text-right">
            <Link href="/forgot-password" className="text-xs font-medium text-accent transition hover:underline">
              Forgot password?
            </Link>
          </div>

          {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="ui-btn ui-btn-primary w-full"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          </form>
        </div>

        <div className="mt-4 space-y-2 text-center">
          <p className="text-sm text-slate-500">Need an account?</p>
          <Link
            href="/portal/signup"
            className="ui-btn ui-btn-primary w-full"
          >
            Create account
          </Link>
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          Invited by your Mira contact? Check your email for a link to set your password.
        </p>
      </div>
    </main>
  );
}
