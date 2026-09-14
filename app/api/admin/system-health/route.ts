import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { getSystemHealth } from "@/lib/systemHealth";

export async function GET() {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  return NextResponse.json(await getSystemHealth());
}