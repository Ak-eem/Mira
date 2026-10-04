import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRequestIp } from "@/lib/rateLimit";
import { getEmbedAvailability } from "@/lib/embed/availability";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Called by public/embed.js on every page load of a customer's website, from
// that site's origin, hence the open CORS header. It only ever returns a boolean.
//
// available:false  = business missing, inactive or CANCELLED -> the widget must
//                    not appear on the site at all.
// available:true   = anything else (including a locked/unpaid business, which
//                    keeps showing its existing "temporarily unavailable" message).
//
// It fails OPEN: any error or rate-limit answers available:true and lets the
// chat page itself decide, so an outage here can't hide a paying business's chat.
const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

const OPEN = () => NextResponse.json({ available: true }, { headers: HEADERS });

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug")?.trim() ?? "";
  if (!slug || slug.length > 100) return OPEN();

  try {
    const client = createServiceRoleClient();
    const limit = await checkRateLimit(client, `embed-status:${getRequestIp(request)}`, 300);
    if (!limit.allowed) return OPEN();

    const available = await getEmbedAvailability(client, slug);
    return NextResponse.json({ available }, { headers: HEADERS });
  } catch {
    return OPEN();
  }
}
