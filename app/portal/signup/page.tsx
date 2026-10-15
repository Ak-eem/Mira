"use client";

import { useState } from "react";
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

export default function PortalSignupPage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [teamChoice, setTeamChoice] = useState<"invite" | "just-me" | "">("");
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
          getApiErrorMessage(result, "Unable to send verification email"),
        );
      }
      setVerificationSent(true);
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Unable to send verification email",
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
        throw new Error(getApiErrorMessage(result, "Unable to verify email"));
      }
      setEmailVerified(true);
      setOtpStatus("success");
    } catch (verifyError) {
      setOtpStatus("error");
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "Unable to verify email",
      );
    } finally {
      setVerificationBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!businessName.trim()) {
      setError("Enter your business name.");
      return;
    }

    if (!teamChoice) {
      setError("Choose whether you want to invite your team.");
      return;
    }

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
            : "Unable to create account",
        );
        return;
      }

      const confirmResponse = await fetch("/api/auth/email-verification/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, userId: data.user.id }),
      });
      const confirmation = await confirmResponse.json().catch(() => null);
      if (
        !confirmResponse.ok ||
        confirmation?.emailConfirmed !== true
      ) {
        const message =
          confirmation && typeof confirmation.error === "string"
            ? confirmation.error
            : "Unable to confirm account email";
        setError(message);
        return;
      }

      // Businesses are admin-only to insert directly (see migration 0001) --
      // this RPC is the one sanctioned way a fresh signup creates its own
      // business and gets a 14-day trial in a single atomic call.
      const { error: provisionError } = await supabase.rpc(
        "provision_new_business",
        {
          p_name: businessName.trim(),
          p_owner_id: data.user.id,
        },
      );
      if (provisionError) {
        setError(
          provisionError.message === "TRIAL_ALREADY_USED"
            ? "This account has already used its free trial. Contact us to set up billing."
            : "Account created, but we couldn't set up your business automatically. Contact support.",
        );
        return;
      }

      router.push("/portal/signup/complete");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to create account",
      );
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
        <div className="space-y-4 rounded-4xl border border-white/80 bg-white/65 p-7 shadow-2xl shadow-sky-200/60 backdrop-blur-2xl sm:p-8">
          <GoogleAuthButton next="/portal/signup/complete" label="Sign up with Google" />

          <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span className="h-px flex-1 bg-slate-200" />
            or
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="field-business-name" className="block text-sm font-medium text-slate-700">
              Business name
            </label>
            <input id="field-business-name"
              type="text"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-accent focus:outline-hidden focus:ring-4 focus:ring-accent/15"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
            />
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-slate-700">
              Team setup
            </legend>
            <p className="mt-1 text-xs text-slate-500">
              Choose how you want to get started.
            </p>
            <div className="mt-2 space-y-2">
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="teamChoice"
                  value="invite"
                  checked={teamChoice === "invite"}
                  onChange={() => setTeamChoice("invite")}
                  required
                />
                <span>Yes, invite my team</span>
              </label>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="teamChoice"
                  value="just-me"
                  checked={teamChoice === "just-me"}
                  onChange={() => setTeamChoice("just-me")}
                  required
                />
                <span>No, just me</span>
              </label>
            </div>
          </fieldset>

          <div>
            <label htmlFor="field-email" className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input id="field-email"
              type="email"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-accent focus:outline-hidden focus:ring-4 focus:ring-accent/15"
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
                className="mt-2 text-sm font-medium text-accent hover:underline disabled:opacity-50"
              >
                {verificationBusy
                  ? "Sending…"
                  : verificationSent
                    ? "Resend code"
                    : "Send verification code"}
              </button>
            )}
          </div>
          {verificationSent && !emailVerified && (
            <div>
              <p id="otp-label" className="block text-sm font-medium text-slate-700">
                6-digit verification code
              </p>
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
          {emailVerified && (
            <p className="text-sm text-green-700">
              Email verified. You can create your account.
            </p>
          )}

          <div>
            <label htmlFor="field-password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input id="field-password"
              type="password"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-accent focus:outline-hidden focus:ring-4 focus:ring-accent/15"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <div>
            <label htmlFor="field-confirm-password" className="block text-sm font-medium text-slate-700">
              Confirm password
            </label>
            <input id="field-confirm-password"
              type="password"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-accent focus:outline-hidden focus:ring-4 focus:ring-accent/15"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !emailVerified || !teamChoice}
            className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-200/70 transition hover:bg-accent-dark disabled:opacity-50"
          >
            {submitting ? "Creating account…" : "Create account"}
          </button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          Already have an account? <Link href="/portal/login" className="text-accent hover:underline">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
