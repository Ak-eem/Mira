'use client';

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import GoogleAuthButton from "@/app/components/GoogleAuthButton";
import CodeSlots, { type CodeSlotsStatus } from "@/components/site/CodeSlots";

function getApiErrorMessage(value: unknown, fallback: string): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return value.error;
  }

  return fallback;
}

export default function SignupPage() {
  const router = useRouter();
  // The landing page footer passes ?email= so the visitor does not retype it.
  // Read it as an external value (empty on the server) instead of setting state
  // in an effect; anything the visitor types takes over from the prefill.
  const prefillEmail = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("email") ?? "",
    () => "",
  );
  const [typedEmail, setEmail] = useState<string | null>(null);
  const email = typedEmail ?? prefillEmail;
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [otpStatus, setOtpStatus] = useState<CodeSlotsStatus>("idle");
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
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          getApiErrorMessage(result, "Unable to send verification email")
        );
      }
      setVerificationSent(true);
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Unable to send verification email"
      );
    } finally {
      setVerificationBusy(false);
    }
  }

  async function verifyEmail(code: string) {
    setError(null);
    setVerificationBusy(true);
    try {
      const response = await fetch("/api/auth/email-verification/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: code }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          getApiErrorMessage(result, "Unable to verify email")
        );
      }
      setEmailVerified(true);
      setOtpStatus("success");
    } catch (verifyError) {
      setOtpStatus("error");
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "Unable to verify email"
      );
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

    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError || !data.user) {
        setError(
          signUpError && typeof signUpError.message === "string"
            ? signUpError.message
            : "Unable to create account"
        );
        return;
      }

      const confirmResponse = await fetch("/api/auth/email-verification/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, userId: data.user.id }),
      });
      const confirmation = await confirmResponse.json().catch(() => null);
      if (!confirmResponse.ok || confirmation?.emailConfirmed !== true) {
        const message = confirmation && typeof confirmation.error === "string" ? confirmation.error : "Unable to confirm account email";
        setError(message);
        return;
      }

      // Email is confirmed server-side above, so the visitor should land signed in.
      // signUp returns a session when Supabase's own "Confirm email" is off; when it
      // is on, sign in explicitly so they never see a "now sign in again" step.
      if (!data.session) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          router.push("/portal/login");
          return;
        }
      }

      // This page doesn't collect a business name, so the next step does.
      router.push("/portal/signup/business-name");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error && submitError.message
          ? submitError.message
          : "Unable to create account"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12 text-slate-900">
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="text-sm font-semibold tracking-tight text-slate-600 transition hover:text-accent">
            Mira <span className="font-normal text-accent">for Business</span>
          </Link>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">Create your account</h1>
          <p className="mt-2 text-sm text-slate-600">Get your business ready for what’s next.</p>
        </div>

        <div className="ui-card ui-enter space-y-5 !p-6 sm:!p-8">
          <GoogleAuthButton next="/portal/signup/complete" label="Sign up with Google" />

          <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span className="h-px flex-1 bg-slate-200" />
            or
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="field-email" className="ui-label">Email</label>
            <input id="field-email"
              type="email"
              className="ui-field"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailVerified(false);
                setVerificationSent(false);
                setOtp("");
                setOtpStatus("idle");
              }}
              required
              disabled={emailVerified}
            />
            {!emailVerified && (
              <button
                type="button"
                onClick={sendVerification}
                disabled={verificationBusy || !email}
                className="mt-1 inline-flex min-h-10 items-center text-sm font-semibold text-accent transition hover:underline disabled:opacity-50"
              >
                {verificationBusy ? "Sending…" : verificationSent ? "Resend code" : "Send verification code"}
              </button>
            )}
          </div>

          {verificationSent && !emailVerified && (
            <div>
              <p id="otp-label" className="ui-label">6-digit verification code</p>
              <div className="mt-2" role="group" aria-labelledby="otp-label">
                <CodeSlots
                  length={6}
                  value={otp}
                  status={otpStatus}
                  disabled={verificationBusy}
                  onChange={(code) => {
                    setOtp(code);
                    setOtpStatus("idle");
                  }}
                  onComplete={(code) => verifyEmail(code)}
                  accentColor="#f5f5f5"
                  inkColor="#f5f5f5"
                  slotColor="#27272a"
                  digitColor="#18181b"
                  dangerColor="#ff3b30"
                  slotSize={44}
                  gap={8}
                  radius={12}
                  bounce={0.2}
                  settle={0.3}
                  rise={8}
                  cascade={20}
                  mask={false}
                  caret
                  outcome="accept"
                  ariaLabel="6-digit verification code"
                />
              </div>
            </div>
          )}

          {emailVerified && <p className="text-sm text-green-600">Email verified. You can create your account.</p>}

          <div>
            <label htmlFor="field-password" className="ui-label">Password</label>
            <div className="relative mt-2">
              <input id="field-password"
                type={showPassword ? "text" : "password"}
                className="ui-field !pr-12"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((show) => !show)}
                className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 hover:text-slate-700"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  {showPassword ? (
                    <>
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.6a2 2 0 002.8 2.8" />
                      <path d="M9.9 5.2A10.8 10.8 0 0112 5c5 0 8.5 4.2 9.5 6-.4.8-1.3 2-2.6 3.1" />
                      <path d="M6.2 6.2C4.3 7.4 3 9.3 2.5 11c.6 1.1 3.9 6 9.5 6 1.1 0 2.1-.2 3-.5" />
                    </>
                  ) : (
                    <>
                      <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="field-confirm-password" className="ui-label">Confirm password</label>
            <input id="field-confirm-password"
              type="password"
              className="ui-field"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>

          {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !emailVerified}
            className="ui-btn ui-btn-primary w-full"
          >
            {submitting ? "Creating account…" : "Create account"}
          </button>
          </form>
        </div>

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
