import "server-only";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InviteRow = {
  id: string;
  business_id: string;
  email: string;
  status: string;
  expires_at: string;
};

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return errorResponse("Authentication required", 401);
  }

  let body: { token?: unknown };
  try {
    body = (await request.json()) as { token?: unknown };
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return errorResponse("A valid invite token is required", 400);
  }

  const service = createServiceRoleClient();
  const {
    data: invite,
    error: inviteError,
  } = await service
    .from("team_invites")
    .select("id,business_id,email,status,expires_at")
    .eq("token", token)
    .maybeSingle<InviteRow>();

  if (inviteError) {
    return errorResponse("Unable to validate team invite", 500);
  }

  if (!invite) {
    return errorResponse("Team invite not found", 404);
  }

  if (invite.status === "accepted") {
    return errorResponse("Team invite has already been accepted", 409);
  }

  if (invite.status !== "pending") {
    return errorResponse("Team invite is no longer valid", 410);
  }

  const now = new Date();
  if (Number.isNaN(Date.parse(invite.expires_at)) || Date.parse(invite.expires_at) <= now.getTime()) {
    return errorResponse("Team invite is no longer valid", 410);
  }

  const authenticatedEmail = user.email?.trim().toLowerCase() ?? "";
  const inviteEmail = invite.email.trim().toLowerCase();
  if (!authenticatedEmail || authenticatedEmail !== inviteEmail) {
    return errorResponse("Invite email does not match authenticated user", 403);
  }

  const {
    data: business,
    error: businessError,
  } = await service
    .from("businesses")
    .select("id,is_active")
    .eq("id", invite.business_id)
    .maybeSingle<{ id: string; is_active: boolean }>();

  if (businessError) {
    return errorResponse("Unable to validate business", 500);
  }

  if (!business || !business.is_active) {
    return errorResponse("Business is not active", 410);
  }

  const { error: ownerError } = await service.from("business_owners").upsert(
    {
      business_id: invite.business_id,
      user_id: user.id,
      role: "staff",
    },
    { onConflict: "business_id,user_id" },
  );

  if (ownerError) {
    return errorResponse("Unable to add team member", 500);
  }

  const acceptedAt = now.toISOString();
  const {
    data: acceptedInvite,
    error: acceptanceError,
  } = await service
    .from("team_invites")
    .update({
      status: "accepted",
      accepted_by: user.id,
      accepted_at: acceptedAt,
    })
    .eq("id", invite.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (acceptanceError) {
    return errorResponse("Unable to accept team invite", 500);
  }

  if (!acceptedInvite) {
    return errorResponse("Team invite has already been accepted", 409);
  }

  return NextResponse.redirect(new URL("/inbox", request.url));
}
