import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRequestIp } from "@/lib/rateLimit";
import { getEmbedAvailability } from "@/lib/embed/availability";
import { parseBrandColor, readableTextOn } from "@/lib/brandColor";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Called by public/embed.js on every page load of a customer's website, from
// that site's origin, hence the open CORS header. It returns a boolean, plus the
// business's brand colour (and a readable text colour for it) when one is set.
//
// available:false  = business missing/inactive, or switched off (cancelled, paid
//                    period or trial ended) -> the widget must not appear at all.
//                    It reappears by itself once the business pays again.
// available:true   = paid up or in a live trial.
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
    if (!available) return NextResponse.json({ available }, { headers: HEADERS });

    // Best effort, kept out of getEmbedAvailability on purpose: if the colour can't be
    // read (column not migrated yet, a hiccup) the widget just keeps its default colour
    // and the availability answer above is unaffected.
    let brandColor: string | null = null;
    try {
      const { data } = await client.from("businesses").select("brand_color").eq("slug", slug).maybeSingle();
      brandColor = parseBrandColor(data?.brand_color);
    } catch {
      brandColor = null;
    }
    return NextResponse.json(
      brandColor ? { available, brandColor, onBrandColor: readableTextOn(brandColor) } : { available },
      { headers: HEADERS },
    );
  } catch {
    return OPEN();
  }
}
