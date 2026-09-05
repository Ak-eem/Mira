import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createEmailVerificationFlowToken,
  EMAIL_VERIFICATION_FLOW_COOKIE,
  hashEmailVerificationFlowToken,
  issueEmailVerification,
  releaseEmailVerification,
} from "@/lib/auth/email-verification";
import { sendEmailWithResend } from "@/lib/email/resend";
import { renderVerificationOtpEmail } from "@/lib/email/templates";

export const runtime = "nodejs";

function requestIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
}

export async function POST(request: Request) {
  let reservation: Awaited<ReturnType<typeof issueEmailVerification>> | null = null;
  try {
    const body = (await request.json()) as { email?: unknown };
    if (typeof body.email !== "string" || body.email.length > 320) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const existingToken = cookieStore.get(EMAIL_VERIFICATION_FLOW_COOKIE)?.value;
    const flowToken = existingToken || createEmailVerificationFlowToken();
    const ip = requestIp(request);
    reservation = await issueEmailVerification(body.email, {
      ip,
      flowTokenHash: hashEmailVerificationFlowToken(body.email, flowToken),
    });
    if (!reservation.sent) {
      return NextResponse.json(
        { error: "Please wait before requesting another code", retryAfterSeconds: reservation.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(reservation.retryAfterSeconds) } },
      );
    }

    const email = renderVerificationOtpEmail({
      otp: reservation.code,
      expiresInMinutes: reservation.expiresInMinutes,
    });
    await sendEmailWithResend({ to: reservation.email, subject: email.subject, html: email.html });

    const response = NextResponse.json({ ok: true, expiresInMinutes: reservation.expiresInMinutes });
    response.cookies.set(EMAIL_VERIFICATION_FLOW_COOKIE, flowToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60,
      path: "/",
    });
    return response;
  } catch {
    if (reservation?.sent) {
      try {
        const cookieStore = await cookies();
        const token = cookieStore.get(EMAIL_VERIFICATION_FLOW_COOKIE)?.value;
        await releaseEmailVerification({
          codeId: reservation.codeId,
          email: reservation.email,
          ip: requestIp(request),
          flowTokenHash: token ? hashEmailVerificationFlowToken(reservation.email, token) : null,
        });
      } catch {
        // The original provider failure remains the user-facing error; retry cleanup is best effort.
      }
    }
    return NextResponse.json({ error: "Unable to send verification email" }, { status: 500 });
  }
}
