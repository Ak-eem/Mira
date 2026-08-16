"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <p className="mb-8 text-center text-xl font-semibold tracking-tight text-slate-900">
          Mira <span className="font-normal text-accent">for Business</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-4 space-y-2 text-center">
          <p className="text-sm text-slate-500">Need an account?</p>
          <Link
            href="/portal/signup"
            className="inline-flex w-full items-center justify-center rounded bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark"
          >
            Create account
          </Link>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Invited by your Mira contact? Check your email for a link to set your password.
        </p>
      </div>
    </div>
  );
}
