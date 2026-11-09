import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRequestIp } from "@/lib/rateLimit";
import { getEmbedAvailability } from "@/lib/embed/availability";
import { embedTheme } from "@/lib/embed/theme";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Called by public/embed.js on every page load of a customer's website, from
// that site's origin, hence the open CORS header. It returns a boolean, plus the
// business's colours when set (see lib/embed/theme.ts): the brand colour for the launcher
// and the chat background for the widget's shell, each with a readable text colour.
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

async function readColumn(
  client: ReturnType<typeof createServiceRoleClient>,
  slug: string,
  column: "brand_color" | "background_color",
): Promise<unknown> {
  try {
    const { data } = await client.from("businesses").select(column).eq("slug", slug).maybeSingle();
    return data ? (data as unknown as Record<string, unknown>)[column] : null;
  } catch {
    return null;
  }
}

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

    // Best effort, kept out of getEmbedAvailability on purpose: if a colour can't be read
    // (column not migrated yet, a hiccup) the widget just keeps its default for that colour
    // and the availability answer above is unaffected. Two separate queries, like the chat
    // page, so a column that doesn't exist yet only costs its own colour.
    const [brand, background] = await Promise.all([
      readColumn(client, slug, "brand_color"),
      readColumn(client, slug, "background_color"),
    ]);
    return NextResponse.json({ available, ...embedTheme(brand, background) }, { headers: HEADERS });
  } catch {
    return OPEN();
  }
}
