import { NextResponse } from "next/server";

import { verifyEmailVerification } from "@/lib/auth/email-verification";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: unknown;
      otp?: unknown;
    };
    if (typeof body.email !== "string" || typeof body.otp !== "string") {
      return NextResponse.json(
        { error: "Email and a six-digit code are required" },
        { status: 400 },
      );
    }

    const result = await verifyEmailVerification(body.email, body.otp);
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

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Unable to verify email" },
      { status: 500 },
    );
  }
}
