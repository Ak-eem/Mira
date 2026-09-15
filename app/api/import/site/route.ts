import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { crawlSite, extractSiteData, isValidHttpUrl } from "@/lib/siteImporter";

function canAccessBusiness(owner: Awaited<ReturnType<typeof getCurrentBusinessOwner>>, businessId: unknown): businessId is string {
  return Boolean(owner && typeof businessId === "string" && owner.businesses.some((business) => business.id === businessId));
}

async function markFailed(importId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  await supabase.from("site_imports").update({ status: "failed", error: "Site import failed.", updated_at: new Date().toISOString() }).eq("id", importId);
}

export async function POST(request: NextRequest) {
  const owner = await getCurrentBusinessOwner();
  if (!owner) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const body = await request.json().catch(() => null) as { businessId?: unknown; url?: unknown } | null;
  if (!canAccessBusiness(owner, body?.businessId)) return NextResponse.json({ error: "Business not found." }, { status: 404 });
  if (!isValidHttpUrl(body?.url)) return NextResponse.json({ error: "A valid HTTP(S) URL is required." }, { status: 400 });

  const supabase = await createClient();
  const { data: created, error: createError } = await supabase.from("site_imports").insert({ business_id: body.businessId, url: body.url, status: "pending" }).select("id").single();
  if (createError || !created) return NextResponse.json({ error: "Could not create site import." }, { status: 500 });

  try {
    await supabase.from("site_imports").update({ status: "crawling", updated_at: new Date().toISOString() }).eq("id", created.id);
    const pages = await crawlSite(body.url);
    await supabase.from("site_imports").update({ status: "extracting", pages, updated_at: new Date().toISOString() }).eq("id", created.id);
    const extracted = await extractSiteData(pages);
    const { error: readyError } = await supabase.from("site_imports").update({ status: "ready", pages, extracted_data: extracted, error: null, updated_at: new Date().toISOString() }).eq("id", created.id);
    if (readyError) throw readyError;
    return NextResponse.json({ id: created.id, status: "ready", pagesCrawled: pages.length, data: extracted }, { status: 201 });
  } catch {
    await markFailed(created.id, supabase);
    return NextResponse.json({ id: created.id, status: "failed", error: "Site import failed." }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  const owner = await getCurrentBusinessOwner();
  if (!owner) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const businessId = new URL(request.url).searchParams.get("businessId");
  if (businessId && !canAccessBusiness(owner, businessId)) return NextResponse.json({ error: "Business not found." }, { status: 404 });
  const supabase = await createClient();
  let query = supabase.from("site_imports").select("id,business_id,url,status,pages,extracted_data,error,created_at,updated_at").order("created_at", { ascending: false });
  if (businessId) query = query.eq("business_id", businessId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Could not load site imports." }, { status: 500 });
  return NextResponse.json({ imports: data ?? [] });
}
