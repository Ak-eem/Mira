import { NextResponse } from "next/server";

import { issueEmailVerification } from "@/lib/auth/email-verification";
import { sendEmailWithResend } from "@/lib/email/resend";
import { renderVerificationOtpEmail } from "@/lib/email/templates";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown };
    if (typeof body.email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const verification = await issueEmailVerification(body.email);
    if (!verification.sent) {
      return NextResponse.json(
        {
          error: "Please wait before requesting another code",
          retryAfterSeconds: verification.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(verification.retryAfterSeconds) },
        },
      );
    }

    const email = renderVerificationOtpEmail({
      otp: verification.code,
      expiresInMinutes: verification.expiresInMinutes,
    });
    await sendEmailWithResend({
      to: verification.email,
      subject: email.subject,
      html: email.html,
    });

    return NextResponse.json({
      ok: true,
      expiresInMinutes: verification.expiresInMinutes,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to send verification email" },
      { status: 500 },
    );
  }
}
