import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { listPreviewTurns, runPreviewTurn } from "@/lib/ai/promptPreviewApi";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  return listPreviewTurns(await createClient(), businessId);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  return runPreviewTurn(await createClient(), businessId, await request.json().catch(() => null));
}
