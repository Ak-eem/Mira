import "server-only";

import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const EMAIL_VERIFICATION_TTL_MINUTES = 10;
export const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = 60;
export const EMAIL_VERIFICATION_HOURLY_SEND_LIMIT = 5;
export const EMAIL_VERIFICATION_FLOW_COOKIE = "email_verification_flow";

export type IssueEmailVerificationResult =
  | { sent: true; email: string; code: string; codeId: string; expiresInMinutes: number }
  | {
      sent: false;
      email: string;
      reason: "cooldown" | "hourly_rate_limit" | "global_rate_limit" | "provider_rate_limit" | "invalid";
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
  if (!pepper) throw new Error("EMAIL_VERIFICATION_PEPPER is not configured");
  return pepper;
}

function hashOtp(email: string, otp: string): string {
  return createHmac("sha256", getPepper()).update(`${email}:${otp}`).digest("hex");
}

export function createEmailVerificationFlowToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashEmailVerificationFlowToken(email: string, token: string): string {
  return createHash("sha256")
    .update(`${getPepper()}:${normalizeEmail(email)}:${token}`)
    .digest("hex");
}

function createOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function issueEmailVerification(
  email: string,
  options: { ip?: string | null; flowTokenHash?: string | null } = {},
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
    p_expires_at: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MINUTES * 60 * 1000).toISOString(),
    p_max_hourly_sends: EMAIL_VERIFICATION_HOURLY_SEND_LIMIT,
    p_ip: options.ip ?? null,
    p_flow_token_hash: options.flowTokenHash ?? null,
  });
  if (error) throw new Error(`Could not issue email verification: ${error.message}`);

  const result = (Array.isArray(data) ? data[0] : data) as {
    allowed?: boolean;
    reason?: string;
    retry_after_seconds?: number;
    code_id?: string;
  } | null;
  if (!result?.allowed) {
    const reason = result?.reason === "hourly_rate_limit"
      ? "hourly_rate_limit"
      : result?.reason === "global_rate_limit"
        ? "global_rate_limit"
        : result?.reason === "provider_rate_limit"
          ? "provider_rate_limit"
          : "cooldown";
    return {
      sent: false,
      email: normalizedEmail,
      reason,
      retryAfterSeconds: Math.max(1, result?.retry_after_seconds ?? 60),
    };
  }
  if (!result.code_id) throw new Error("Email verification reservation did not return an id");

  return {
    sent: true,
    email: normalizedEmail,
    code,
    codeId: result.code_id,
    expiresInMinutes: EMAIL_VERIFICATION_TTL_MINUTES,
  };
}

export async function releaseEmailVerification(options: {
  codeId: string;
  email: string;
  ip?: string | null;
  flowTokenHash?: string | null;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.rpc("release_email_verification", {
    p_code_id: options.codeId,
    p_email: normalizeEmail(options.email),
    p_ip: options.ip ?? null,
    p_flow_token_hash: options.flowTokenHash ?? null,
  });
  if (error) throw new Error(`Could not release email verification: ${error.message}`);
}

export async function verifyEmailVerification(
  email: string,
  otp: string,
  flowTokenHash?: string | null,
): Promise<VerifyEmailVerificationResult> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedOtp = otp.trim();
  if (!normalizedEmail || !normalizedEmail.includes("@") || !/^\d{6}$/.test(normalizedOtp)) {
    return { verified: false, email: normalizedEmail, reason: "invalid", attemptsRemaining: 0 };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("verify_email_verification", {
    p_email: normalizedEmail,
    p_code_hash: hashOtp(normalizedEmail, normalizedOtp),
    p_flow_token_hash: flowTokenHash ?? null,
  });
  if (error) throw new Error(`Could not verify email: ${error.message}`);

  const result = (Array.isArray(data) ? data[0] : data) as {
    success?: boolean;
    reason?: string;
    attempts_remaining?: number;
  } | null;
  if (result?.success) return { verified: true, email: normalizedEmail };

  const reason = result?.reason === "expired"
    ? "expired"
    : result?.reason === "too_many_attempts"
      ? "too_many_attempts"
      : result?.reason === "wrong_code"
        ? "wrong_code"
        : "invalid";
  return {
    verified: false,
    email: normalizedEmail,
    reason,
    attemptsRemaining: Math.max(0, result?.attempts_remaining ?? 0),
  };
}
