"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function PortalSignupPage() {
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
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError || !data.user) {
      setError(signUpError?.message ?? "Unable to create account");
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <p className="mb-8 text-center text-xl font-semibold tracking-tight text-slate-900">
          Mira <span className="font-normal text-accent">for Business</span>
        </p>
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input type="email" className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" value={email} onChange={(e) => { setEmail(e.target.value); setEmailVerified(false); }} required disabled={emailVerified} />
            {!emailVerified && (
              <button type="button" onClick={sendVerification} disabled={verificationBusy || !email} className="mt-2 text-sm font-medium text-accent hover:underline disabled:opacity-50">
                {verificationBusy ? "Sending…" : verificationSent ? "Resend code" : "Send verification code"}
              </button>
            )}
          </div>
          {verificationSent && !emailVerified && (
            <div>
              <label className="block text-sm font-medium text-slate-700">6-digit verification code</label>
              <div className="mt-1 flex gap-2">
                <input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} className="w-full rounded border border-slate-300 px-3 py-2 text-sm tracking-[0.3em] focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} required />
                <button type="button" onClick={verifyEmail} disabled={verificationBusy || otp.length !== 6} className="rounded bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Verify</button>
              </div>
            </div>
          )}
          {emailVerified && <p className="text-sm text-green-700">Email verified. You can create your account.</p>}
          <div>
            <label className="block text-sm font-medium text-slate-700">Password</label>
            <input type="password" className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Confirm password</label>
            <input type="password" className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={6} required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={submitting || !emailVerified} className="w-full rounded bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50">
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-400">Already have an account? <Link href="/portal/login" className="text-accent hover:underline">Sign in</Link></p>
      </div>
    </div>
  );
}
