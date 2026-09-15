import { NextRequest, NextResponse } from "next/server";
import { extractBusinessInfo } from "@/lib/ai/extractBusinessInfo";
import { fetchCrawlResource, scrapeBusinessWebsite } from "@/lib/ai/scrapeBusiness";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

async function authorize(businessId: string) {
  const owner = await getCurrentBusinessOwner();
  return owner?.businesses.some((business) => business.id === businessId) ? owner : null;
}

async function mirrorProductImage(businessId: string, draftId: string, imageUrl: string): Promise<string | null> {
  const resource = await fetchCrawlResource(imageUrl);
  if (resource.status < 200 || resource.status >= 300 || !resource.contentType || !["image/jpeg", "image/png", "image/webp"].includes(resource.contentType)) {
    throw new Error("Product image is not an allowed image response.");
  }
  const extension = resource.contentType === "image/jpeg" ? "jpg" : resource.contentType.slice("image/".length);
  const path = `${businessId}/${draftId}-${Date.now()}.${extension}`;
  const body = new ArrayBuffer(resource.body.byteLength);
  new Uint8Array(body).set(resource.body);
  const storage = createServiceRoleClient().storage.from("product-images");
  const { error } = await storage.upload(path, body, { contentType: resource.contentType, cacheControl: "31536000", upsert: false });
  if (error) throw error;
  return storage.getPublicUrl(path).data.publicUrl;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  if (!await authorize(businessId)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("scrape_drafts").select("*").eq("business_id", businessId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Could not load scrape drafts." }, { status: 500 });
  return NextResponse.json({ drafts: data ?? [] });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  if (!await authorize(businessId)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.websiteUrl !== "string" || body.websiteUrl.trim().length > 2_000) {
    return NextResponse.json({ error: "Enter a valid website URL." }, { status: 400 });
  }

  try {
    const sourceUrl = new URL(body.websiteUrl.trim()).toString();
    const scrape = await scrapeBusinessWebsite(sourceUrl);
    const extracted = await extractBusinessInfo(scrape);
    const rows = extracted.map((item) => ({ business_id: businessId, kind: item.kind, source_url: scrape.pages.find((page) => page.text.toLowerCase().includes(String(item.payload.name ?? item.payload.title ?? item.payload.question ?? "").toLowerCase()))?.url ?? scrape.pages[0]?.url ?? sourceUrl, payload: item.payload, status: "pending" }));
    if (rows.length === 0) return NextResponse.json({ drafts: [] });

    const supabase = await createClient();
    const { data, error } = await supabase.from("scrape_drafts").insert(rows).select("*");
    if (error) return NextResponse.json({ error: "Could not save scrape drafts." }, { status: 500 });
    return NextResponse.json({ drafts: data ?? [] }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not import that website." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  if (!await authorize(businessId)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.draftId !== "string") return NextResponse.json({ error: "Draft id is required." }, { status: 400 });
  const supabase = await createClient();

  if (body.status === "approved" || body.status === "rejected") {
    let imageUrl: string | null = null;
    let imageImportFailed = false;
    if (body.status === "approved") {
      const { data: draft } = await supabase.from("scrape_drafts").select("kind, payload").eq("id", body.draftId).eq("business_id", businessId).eq("status", "pending").maybeSingle();
      const candidateImageUrl = draft?.kind === "product" && draft.payload && typeof draft.payload === "object" && typeof (draft.payload as Record<string, unknown>).candidate_image_url === "string"
        ? (draft.payload as Record<string, unknown>).candidate_image_url
        : null;
      if (candidateImageUrl) {
        try { imageUrl = await mirrorProductImage(businessId, body.draftId, candidateImageUrl); }
        catch (error) { imageImportFailed = true; console.warn("Could not mirror scraped product image.", error); }
      }
    }
    const { error } = body.status === "approved"
      ? await supabase.rpc("approve_scrape_draft", { p_draft_id: body.draftId, p_image_url: imageUrl })
      : await supabase.rpc("reject_scrape_draft", { p_draft_id: body.draftId });
    if (error) return NextResponse.json({ error: "Could not review that draft." }, { status: 400 });
    if (imageImportFailed) return NextResponse.json({ message: "Product added, but its image could not be imported. You can upload one manually.", imageImported: false });
    if (body.status === "approved" && imageUrl) return NextResponse.json({ message: "Product and image added.", imageImported: true });
  } else {
    if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) return NextResponse.json({ error: "A draft payload is required." }, { status: 400 });
    const { error } = await supabase.from("scrape_drafts").update({ payload: body.payload }).eq("id", body.draftId).eq("business_id", businessId).eq("status", "pending");
    if (error) return NextResponse.json({ error: "Could not update that draft." }, { status: 400 });
  }

  const { data, error } = await supabase.from("scrape_drafts").select("*").eq("id", body.draftId).eq("business_id", businessId).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Could not load the reviewed draft." }, { status: 500 });
  return NextResponse.json({ draft: data });
}
