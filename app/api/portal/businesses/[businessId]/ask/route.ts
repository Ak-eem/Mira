import { NextRequest, NextResponse } from "next/server";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { createClient } from "@/lib/supabase/server";
import { ASK_ALLOWED_ROLES, handleAsk } from "@/lib/ask/api";

export const runtime = "nodejs";
// A question can take several model calls; the loop itself stops at 28 seconds.
export const maxDuration = 45;

export async function POST(request: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const owner = await getCurrentBusinessOwner();
  const membership = owner?.businesses.find((business) => business.id === businessId);
  if (!membership || !ASK_ALLOWED_ROLES.includes(membership.role)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  return handleAsk(await createClient(), businessId, await request.json().catch(() => null));
}
