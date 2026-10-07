import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit, getRequestIp } from "@/lib/rateLimit";
import { sendEmailWithResend } from "@/lib/email/resend";

// "Talk to the team" form on the landing page. Emails the message to CONTACT_TO_EMAIL.
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: NextRequest) {
  const to = process.env.CONTACT_TO_EMAIL;
  if (!to) return NextResponse.json({ error: "Contact form is not configured." }, { status: 503 });

  const limit = await checkRateLimit(createServiceRoleClient(), `contact:${getRequestIp(request)}`, 5, 600);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (clean(body?.website, 100)) return NextResponse.json({ ok: true }); // honeypot: bots fill this in

  const name = clean(body?.name, 120);
  const business = clean(body?.business, 160);
  const contact = clean(body?.contact, 200);
  const message = clean(body?.message, 3000);
  if (!contact || !message) return NextResponse.json({ error: "Contact and message are required." }, { status: 400 });

  try {
    await sendEmailWithResend({
      to,
      subject: `Mira enquiry from ${name || contact}`,
      html: `<p><b>Name:</b> ${esc(name)}</p><p><b>Business:</b> ${esc(business)}</p><p><b>Contact:</b> ${esc(contact)}</p><p>${esc(message).replace(/\n/g, "<br>")}</p>`,
    });
  } catch (error) {
    console.error("Contact email failed:", error);
    return NextResponse.json({ error: "Could not send." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
