"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function sendVerification() {
    setError(null);
    setVerificationBusy(true);
    try {
      const response = await fetch("/api/auth/email-verification/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to send verification email");
      setVerificationSent(true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send verification email");
    } finally {
      setVerificationBusy(false);
    }
  }

  async function verifyEmail() {
    setError(null);
    setVerificationBusy(true);
    try {
      const response = await fetch("/api/auth/email-verification/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to verify email");
      setEmailVerified(true);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Unable to verify email");
    } finally {
      setVerificationBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!emailVerified) {
      setError("Verify your email before creating an account.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setSubmitting(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error || !data.user) {
      setError(error?.message ?? "Unable to create account");
      setSubmitting(false);
      return;
    }

    const confirmResponse = await fetch("/api/auth/email-verification/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, userId: data.user.id }),
    });
    const confirmation = await confirmResponse.json();
    if (!confirmResponse.ok || !confirmation.emailConfirmed) {
      setError(confirmation.error ?? "Unable to confirm account email");
      setSubmitting(false);
      return;
    }

    router.push("/portal/signup/complete");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-12 text-slate-900">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(125,211,252,0.35),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(165,243,252,0.4),_transparent_42%)]" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="text-2xl font-semibold tracking-tight text-slate-900">
            Mira <span className="font-normal text-accent">for Business</span>
          </Link>
          <p className="mt-3 text-sm text-slate-600">Create your account and get your business ready for what’s next.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-[2rem] border border-white/80 bg-white/65 p-7 shadow-2xl shadow-sky-200/60 backdrop-blur-2xl sm:p-8"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-cyan-100"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailVerified(false); }}
              required
              disabled={emailVerified}
            />
            {!emailVerified && (
              <button
                type="button"
                onClick={sendVerification}
                disabled={verificationBusy || !email}
                className="mt-2 text-sm font-semibold text-accent transition hover:underline disabled:opacity-50"
              >
                {verificationBusy ? "Sending…" : verificationSent ? "Resend code" : "Send verification code"}
              </button>
            )}
          </div>

          {verificationSent && !emailVerified && (
            <div>
              <label className="block text-sm font-medium text-slate-700">6-digit verification code</label>
              <div className="mt-2 flex gap-2">
                <input
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm tracking-[0.3em] outline-none transition focus:border-accent focus:ring-4 focus:ring-cyan-100"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  required
                />
                <button
                  type="button"
                  onClick={verifyEmail}
                  disabled={verificationBusy || otp.length !== 6}
                  className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-dark disabled:opacity-50"
                >
                  Verify
                </button>
              </div>
            </div>
          )}

          {emailVerified && <p className="text-sm text-green-600">Email verified. You can create your account.</p>}

          <div>
            <label className="block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-cyan-100"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Confirm password</label>
            <input
              type="password"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-cyan-100"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>

          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !emailVerified}
            className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-200/70 transition hover:bg-accent-dark disabled:opacity-50"
          >
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/portal/login" className="font-semibold text-accent transition hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
