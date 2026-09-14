import { NextRequest, NextResponse } from "next/server";
import { normalizeTheme } from "@/lib/types";
import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const theme = normalizeTheme(body?.theme ?? body);
  const { businessId } = await params;
  const supabase = await createClient();
  const { error } = await supabase.from("businesses").update({ theme }).eq("id", businessId);

  if (error) return NextResponse.json({ error: "Could not update theme." }, { status: 500 });
  return NextResponse.json({ theme });
}