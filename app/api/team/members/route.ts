import "server-only";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEMBER_COLUMNS = "id,business_id,user_id,role,created_at";

type MemberRow = {
  id: string;
  business_id: string;
  user_id: string;
  role: string;
  created_at: string;
};

export async function GET(request: Request) {
  const businessId = new URL(request.url).searchParams.get("businessId")?.trim() ?? "";

  if (!UUID_RE.test(businessId)) {
    return NextResponse.json(
      { error: "A valid businessId is required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { data: owner, error: ownerError } = await supabase
    .from("business_owners")
    .select("id")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (ownerError) {
    console.error("team members owner lookup failed", {
      businessId,
      code: ownerError.code,
    });
    return NextResponse.json(
      { error: "Unable to verify business access" },
      { status: 500 },
    );
  }

  if (!owner) {
    return NextResponse.json(
      { error: "Only a business owner can list team members" },
      { status: 403 },
    );
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("business_owners")
    .select(MEMBER_COLUMNS)
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("team members list failed", {
      businessId,
      code: error.code,
    });
    return NextResponse.json(
      { error: "Unable to list team members" },
      { status: 500 },
    );
  }

  const members = ((data ?? []) as MemberRow[]).map((member) => ({
    id: member.id,
    businessId: member.business_id,
    userId: member.user_id,
    role: member.role,
    createdAt: member.created_at,
  }));

  return NextResponse.json({ members });
}
