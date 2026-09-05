import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  EMAIL_VERIFICATION_FLOW_COOKIE,
  hashEmailVerificationFlowToken,
  verifyEmailVerification,
} from "@/lib/auth/email-verification";

export const runtime = "nodejs";

const EMAIL_VERIFICATION_CONFIRMED_COOKIE = "email_verification_confirmed";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown; otp?: unknown; userId?: unknown };
    if (typeof body.email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const flowToken = cookieStore.get(EMAIL_VERIFICATION_FLOW_COOKIE)?.value;
    if (!flowToken) return NextResponse.json({ error: "Verification session expired" }, { status: 400 });
    const flowTokenHash = hashEmailVerificationFlowToken(body.email, flowToken);

    if (typeof body.userId === "string") {
      const confirmedTokenHash = cookieStore.get(EMAIL_VERIFICATION_CONFIRMED_COOKIE)?.value;
      if (confirmedTokenHash !== flowTokenHash) {
        return NextResponse.json({ error: "Verify this email before confirming the account" }, { status: 400 });
      }

      const supabase = createServiceRoleClient();
      const { data, error } = await supabase.auth.admin.getUserById(body.userId);
      if (error || !data.user || data.user.email?.trim().toLowerCase() !== body.email.trim().toLowerCase()) {
        return NextResponse.json({ error: "Unable to confirm this account" }, { status: 400 });
      }
      if (!data.user.email_confirmed_at) {
        const { error: updateError } = await supabase.auth.admin.updateUserById(body.userId, {
          email_confirm: true,
        });
        if (updateError) throw updateError;
      }
      const response = NextResponse.json({ ok: true, emailConfirmed: true });
      response.cookies.delete(EMAIL_VERIFICATION_CONFIRMED_COOKIE);
      return response;
    }

    if (typeof body.otp !== "string") {
      return NextResponse.json({ error: "Email and a six-digit code are required" }, { status: 400 });
    }
    const result = await verifyEmailVerification(body.email, body.otp, flowTokenHash);
    if (!result.verified) {
      return NextResponse.json(
        {
          error: "The verification code is invalid or expired",
          reason: result.reason,
          attemptsRemaining: result.attemptsRemaining,
        },
        { status: 400 },
      );
    }

    const response = NextResponse.json({ ok: true, emailVerified: true, requiresSignup: true });
    response.cookies.set(EMAIL_VERIFICATION_CONFIRMED_COOKIE, flowTokenHash, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60,
      path: "/",
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Unable to verify email" }, { status: 500 });
  }
}
