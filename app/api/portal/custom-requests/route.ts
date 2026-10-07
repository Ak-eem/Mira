import "server-only";

import { NextResponse } from "next/server";

import { sendEmailWithResend } from "@/lib/email/resend";
import { checkRateLimit } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A signed-in business sends a custom request (feature, integration, change). It is
// emailed to CUSTOM_REQUEST_TO_EMAIL, with the business's own email as reply-to.
const CATEGORIES = ["New feature", "Change to my assistant", "Integration", "Something else"];
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const to = process.env.CUSTOM_REQUEST_TO_EMAIL || process.env.CONTACT_TO_EMAIL;
  if (!to) return NextResponse.json({ error: "Requests are not configured yet." }, { status: 503 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const businessId = clean(body?.businessId, 64);
  const category = CATEGORIES.includes(clean(body?.category, 60)) ? clean(body?.category, 60) : "Something else";
  const title = clean(body?.title, 140);
  const details = clean(body?.details, 4000);
  if (!UUID.test(businessId)) return NextResponse.json({ error: "A valid businessId is required" }, { status: 400 });
  if (!title || !details) return NextResponse.json({ error: "Add a title and some details." }, { status: 400 });

  // Only members of this business may send a request in its name.
  const { data: member, error: memberError } = await supabase
    .from("business_owners")
    .select("id")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (memberError) return NextResponse.json({ error: "Unable to verify business access" }, { status: 500 });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limit = await checkRateLimit(createServiceRoleClient(), `custom-request:${user.id}`, 5, 3600);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });

  const { data: business } = await supabase.from("businesses").select("name").eq("id", businessId).maybeSingle();
  const businessName = (business as { name?: string } | null)?.name ?? "Unknown business";

  try {
    await sendEmailWithResend({
      to,
      replyTo: user.email ?? undefined,
      subject: `[Custom request] ${businessName}: ${title}`,
      html: `<p><b>Business:</b> ${esc(businessName)} (${esc(businessId)})</p>
<p><b>From:</b> ${esc(user.email ?? "unknown")}</p>
<p><b>Type:</b> ${esc(category)}</p>
<p><b>${esc(title)}</b></p>
<p>${esc(details).replace(/\n/g, "<br>")}</p>`,
    });
  } catch (error) {
    console.error("Custom request email failed:", error);
    return NextResponse.json({ error: "Could not send your request. Please try again." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
