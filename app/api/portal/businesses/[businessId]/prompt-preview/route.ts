import { NextRequest, NextResponse } from "next/server";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { createClient } from "@/lib/supabase/server";
import { listPreviewTurns, runPreviewTurn } from "@/lib/ai/promptPreviewApi";

export const runtime = "nodejs";

// Any team member who can save a draft can preview it.
async function authorize(businessId: string) {
  const owner = await getCurrentBusinessOwner();
  return owner?.businesses.some((business) => business.id === businessId) ? owner : null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  if (!(await authorize(businessId))) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  return listPreviewTurns(await createClient(), businessId);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  if (!(await authorize(businessId))) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  return runPreviewTurn(await createClient(), businessId, await request.json().catch(() => null));
}
