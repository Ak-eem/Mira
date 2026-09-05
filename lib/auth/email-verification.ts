import "server-only";

import { createHmac, randomInt } from "node:crypto";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const EMAIL_VERIFICATION_TTL_MINUTES = 10;
export const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = 60;
export const EMAIL_VERIFICATION_HOURLY_SEND_LIMIT = 5;

export type IssueEmailVerificationResult =
  | {
      sent: true;
      email: string;
      code: string;
      expiresInMinutes: number;
    }
  | {
      sent: false;
      email: string;
      reason: "cooldown" | "hourly_rate_limit";
      retryAfterSeconds: number;
    };

export type VerifyEmailVerificationResult =
  | { verified: true; email: string }
  | {
      verified: false;
      email: string;
      reason: "invalid" | "expired" | "too_many_attempts" | "wrong_code";
      attemptsRemaining: number;
    };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getPepper(): string {
  const pepper = process.env.EMAIL_VERIFICATION_PEPPER;
  if (!pepper) {
    throw new Error("EMAIL_VERIFICATION_PEPPER is not configured");
  }
  return pepper;
}

function hashOtp(email: string, otp: string): string {
  return createHmac("sha256", getPepper())
    .update(`${email}:${otp}`)
    .digest("hex");
}

function createOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function issueEmailVerification(
  email: string,
): Promise<IssueEmailVerificationResult> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("A valid email address is required");
  }

  const code = createOtp();
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("issue_email_verification", {
    p_email: normalizedEmail,
    p_code_hash: hashOtp(normalizedEmail, code),
    p_expires_at: new Date(
      Date.now() + EMAIL_VERIFICATION_TTL_MINUTES * 60 * 1000,
    ).toISOString(),
    p_max_hourly_sends: EMAIL_VERIFICATION_HOURLY_SEND_LIMIT,
  });

  if (error) {
    throw new Error(`Could not issue email verification: ${error.message}`);
  }

  const result = (Array.isArray(data) ? data[0] : data) as
    | {
        allowed?: boolean;
        reason?: string;
        retry_after_seconds?: number;
      }
    | null;

  if (!result?.allowed) {
    const reason = result?.reason === "hourly_rate_limit"
      ? "hourly_rate_limit"
      : "cooldown";
    return {
      sent: false,
      email: normalizedEmail,
      reason,
      retryAfterSeconds: Math.max(1, result?.retry_after_seconds ?? 60),
    };
  }

  return {
    sent: true,
    email: normalizedEmail,
    code,
    expiresInMinutes: EMAIL_VERIFICATION_TTL_MINUTES,
  };
}

export async function verifyEmailVerification(
  email: string,
  otp: string,
): Promise<VerifyEmailVerificationResult> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedOtp = otp.trim();
  if (!normalizedEmail || !normalizedEmail.includes("@") || !/^\d{6}$/.test(normalizedOtp)) {
    return {
      verified: false,
      email: normalizedEmail,
      reason: "invalid",
      attemptsRemaining: 0,
    };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("verify_email_verification", {
    p_email: normalizedEmail,
    p_code_hash: hashOtp(normalizedEmail, normalizedOtp),
  });

  if (error) {
    throw new Error(`Could not verify email: ${error.message}`);
  }

  const result = (Array.isArray(data) ? data[0] : data) as
    | { success?: boolean; reason?: string; attempts_remaining?: number }
    | null;
  const reason = result?.reason;

  if (result?.success) {
    return { verified: true, email: normalizedEmail };
  }

  return {
    verified: false,
    email: normalizedEmail,
    reason: reason === "expired"
      ? "expired"
      : reason === "too_many_attempts"
        ? "too_many_attempts"
        : reason === "wrong_code"
          ? "wrong_code"
          : "invalid",
    attemptsRemaining: Math.max(0, result?.attempts_remaining ?? 0),
  };
}
