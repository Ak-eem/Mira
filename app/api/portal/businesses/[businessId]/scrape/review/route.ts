import { NextRequest, NextResponse } from "next/server";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { createClient } from "@/lib/supabase/server";
import { mirrorProductImage } from "@/lib/scrape/mirrorProductImage";
import { reviewDraftsBatch } from "@/lib/scrape/reviewBatch";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function authorize(businessId: string) {
  const owner = await getCurrentBusinessOwner();
  return owner?.businesses.some((business) => business.id === businessId) ? owner : null;
}

// Approve the ticked scraped drafts and discard the rest, in one request.
// The single-draft PATCH in ../route.ts is still what powers "Edit".
//
// Runs as the signed-in user (not the service role): the RLS policies and
// the approve/reject RPCs' own owner checks stay in force. The business_id
// filter below is what stops one business referencing another's draft ids.
export async function POST(request: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  if (!(await authorize(businessId))) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const supabase = await createClient();

  const result = await reviewDraftsBatch(
    {
      async loadPending(ids) {
        // Non-UUID ids can't be real drafts, and querying a uuid column with
        // them would fail the whole lookup. Leave them out: they come back
        // as "not found" for that one item.
        const valid = ids.filter((id) => UUID.test(id));
        if (valid.length === 0) return { drafts: [], failed: false };
        const { data, error } = await supabase
          .from("scrape_drafts")
          .select("id, kind, payload")
          .eq("business_id", businessId)
          .eq("status", "pending")
          .in("id", valid);
        if (error) {
          console.error("Batch review: could not load pending drafts", error);
          return { drafts: [], failed: true };
        }
        return { drafts: data ?? [], failed: false };
      },
      mirrorImage: (draftId, imageUrl) => mirrorProductImage(businessId, draftId, imageUrl),
      async approve(draftId, imageUrl) {
        const { error } = await supabase.rpc("approve_scrape_draft", { p_draft_id: draftId, p_image_url: imageUrl });
        if (error) console.error("Batch review: approve failed", draftId, error);
        return !error;
      },
      async reject(draftId) {
        const { error } = await supabase.rpc("reject_scrape_draft", { p_draft_id: draftId });
        if (error) console.error("Batch review: reject failed", draftId, error);
        return !error;
      },
    },
    { approveIds: body?.approveIds, rejectIds: body?.rejectIds },
  );

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
