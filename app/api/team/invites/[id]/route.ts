import "server-only";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const inviteId = id?.trim() ?? "";

  if (!isUuid(inviteId)) {
    return NextResponse.json(
      { error: "A valid invite id is required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const service = createServiceRoleClient();
  const { data: invite, error: inviteError } = await service
    .from("team_invites")
    .select("id,business_id,status")
    .eq("id", inviteId)
    .maybeSingle();

  if (inviteError) {
    console.error("team invite lookup failed", {
      inviteId,
      code: inviteError.code,
    });
    return NextResponse.json(
      { error: "Unable to look up team invite" },
      { status: 500 },
    );
  }

  if (!invite) {
    return NextResponse.json(
      { error: "Team invite not found" },
      { status: 404 },
    );
  }

  const { data: owner, error: ownerError } = await service
    .from("business_owners")
    .select("id")
    .eq("business_id", invite.business_id)
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (ownerError) {
    console.error("team invite owner lookup failed", {
      businessId: invite.business_id,
      inviteId,
      code: ownerError.code,
    });
    return NextResponse.json(
      { error: "Unable to verify business access" },
      { status: 500 },
    );
  }

  if (!owner) {
    return NextResponse.json(
      { error: "Only a business owner can revoke invites" },
      { status: 403 },
    );
  }

  if (invite.status === "revoked") {
    return NextResponse.json({
      success: true,
      invite: { id: invite.id, status: invite.status },
    });
  }

  if (invite.status !== "pending") {
    return NextResponse.json(
      { error: "Only pending invites can be revoked" },
      { status: 409 },
    );
  }

  const revokedAt = new Date().toISOString();
  const { data: revokedInvite, error: revokeError } = await service
    .from("team_invites")
    .update({ status: "revoked", revoked_at: revokedAt })
    .eq("id", inviteId)
    .eq("status", "pending")
    .select("id,status,revoked_at")
    .maybeSingle();

  if (revokeError) {
    console.error("team invite revocation failed", {
      businessId: invite.business_id,
      inviteId,
      code: revokeError.code,
    });
    return NextResponse.json(
      { error: "Unable to revoke team invite" },
      { status: 500 },
    );
  }

  if (!revokedInvite) {
    return NextResponse.json(
      { error: "Only pending invites can be revoked" },
      { status: 409 },
    );
  }

  return NextResponse.json({
    success: true,
    invite: {
      id: revokedInvite.id,
      status: revokedInvite.status,
      revokedAt: revokedInvite.revoked_at,
    },
  });
}
