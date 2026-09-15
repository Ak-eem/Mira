import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";

function canAccessBusiness(owner: Awaited<ReturnType<typeof getCurrentBusinessOwner>>, businessId: unknown): businessId is string {
  return Boolean(owner && typeof businessId === "string" && owner.businesses.some((business) => business.id === businessId));
}

function selectedRecords(source: unknown, selection: unknown): Record<string, unknown>[] {
  if (!Array.isArray(selection)) return [];
  return selection.flatMap((entry) => {
    if (typeof entry === "number" && Array.isArray(source) && source[entry] && typeof source[entry] === "object") return [source[entry] as Record<string, unknown>];
    return entry && typeof entry === "object" && !Array.isArray(entry) ? [entry as Record<string, unknown>] : [];
  });
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numericPrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function selectedValue(body: Record<string, unknown>, selected: Record<string, unknown>, key: string, alternate: string): unknown {
  return selected[key] ?? body[key] ?? body[alternate];
}

export async function POST(request: NextRequest) {
  const owner = await getCurrentBusinessOwner();
  if (!owner) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const importId = body?.importId;
  if (typeof importId !== "string" || !importId) return NextResponse.json({ error: "importId is required." }, { status: 400 });

  const supabase = await createClient();
  const { data: siteImport, error: importError } = await supabase.from("site_imports").select("id,business_id,status,extracted_data").eq("id", importId).maybeSingle();
  if (importError || !siteImport || !canAccessBusiness(owner, siteImport.business_id)) return NextResponse.json({ error: "Import not found." }, { status: 404 });
  if (siteImport.status !== "ready") return NextResponse.json({ error: "Only a ready import can be approved." }, { status: 409 });

  const selected = body?.selected && typeof body.selected === "object" && !Array.isArray(body.selected) ? body.selected as Record<string, unknown> : body ?? {};
  const extracted = siteImport.extracted_data && typeof siteImport.extracted_data === "object" ? siteImport.extracted_data as Record<string, unknown> : {};
  const products = selectedRecords(extracted.products, selectedValue(body ?? {}, selected, "products", "selectedProducts"));
  const faqs = selectedRecords(extracted.faqs, selectedValue(body ?? {}, selected, "faqs", "selectedFaqs"));
  const policies = selectedRecords(extracted.policies, selectedValue(body ?? {}, selected, "policies", "selectedPolicies"));
  const hours = selectedRecords(extracted.business_hours, selectedValue(body ?? {}, selected, "business_hours", "selectedBusinessHours"));
  const skippedProducts: Array<{ name: string; reason: string }> = [];

  const productRows = products.flatMap((product) => {
    const name = text(product.name);
    const price = numericPrice(product.price);
    if (!name || price === null) {
      skippedProducts.push({ name: name ?? "Unnamed product", reason: "Skipped because price is not a valid non-negative number." });
      return [];
    }
    const image = text(product.image_url ?? product.imageUrl);
    return [{ business_id: siteImport.business_id, name, description: text(product.description), price, image_url: image && /^https?:\\/\\//i.test(image) ? image : null, is_available: true }];
  });

  const faqRows = faqs.flatMap((faq) => {
    const question = text(faq.question);
    const answer = text(faq.answer);
    return question && answer ? [{ business_id: siteImport.business_id, question, answer, is_active: true }] : [];
  });
  const policyRows = policies.flatMap((policy) => {
    const title = text(policy.title);
    const content = text(policy.content);
    return title && content ? [{ business_id: siteImport.business_id, title, content, is_active: true }] : [];
  });
  const hourRows = hours.flatMap((hour) => {
    const day = Number(hour.day_of_week ?? hour.day);
    if (!Number.isInteger(day) || day < 0 || day > 6) return [];
    return [{ business_id: siteImport.business_id, day_of_week: day, opens_at: text(hour.opens_at ?? hour.open), closes_at: text(hour.closes_at ?? hour.close) }];
  });

  try {
    if (productRows.length) {
      const { error } = await supabase.from("products").insert(productRows);
      if (error) throw error;
    }
    if (faqRows.length) {
      const { error } = await supabase.from("faqs").insert(faqRows);
      if (error) throw error;
    }
    if (policyRows.length) {
      const { error } = await supabase.from("policies").insert(policyRows);
      if (error) throw error;
    }
    if (hourRows.length) {
      const { error } = await supabase.from("business_hours").upsert(hourRows, { onConflict: "business_id,day_of_week" });
      if (error) throw error;
    }

    const businessInfo = selected.businessInfo && typeof selected.businessInfo === "object" && !Array.isArray(selected.businessInfo) ? selected.businessInfo as Record<string, unknown> : null;
    const businessName = text(businessInfo?.name);
    if (businessName) {
      const { error } = await supabase.from("businesses").update({ name: businessName, updated_at: new Date().toISOString() }).eq("id", siteImport.business_id);
      if (error) throw error;
    }

    const { error: statusError } = await supabase.from("site_imports").update({ status: "imported", error: null, updated_at: new Date().toISOString() }).eq("id", importId);
    if (statusError) throw statusError;
    return NextResponse.json({ importId, status: "imported", imported: { products: productRows.length, faqs: faqRows.length, policies: policyRows.length, business_hours: hourRows.length }, skippedProducts, businessInfo: { nameUpdated: Boolean(businessName), taglineUpdated: false }, services: { extracted: Array.isArray(extracted.services) ? extracted.services.length : 0, imported: 0 } });
  } catch {
    return NextResponse.json({ error: "Could not approve site import." }, { status: 500 });
  }
}
