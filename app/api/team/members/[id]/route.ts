import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEMBER_COLUMNS = "id,business_id,user_id,role,created_at";

type MemberRow = {
  id: string;
  business_id: string;
  user_id: string;
  role: "owner" | "staff" | string;
  created_at: string;
};

type Body = {
  action?: unknown;
  role?: unknown;
};

function memberState(member: MemberRow) {
  return {
    id: member.id,
    businessId: member.business_id,
    userId: member.user_id,
    role: member.role,
    createdAt: member.created_at,
  };
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const memberId = id?.trim() ?? "";

  if (!UUID_RE.test(memberId)) {
    return errorResponse("A valid team member id is required", 400);
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  const requestedRole = typeof body.role === "string" ? body.role.trim().toLowerCase() : "";
  const isRoleChange = action === "role" || action === "change_role" || action === "update_role";

  if (action !== "remove" && !isRoleChange) {
    return errorResponse("Action must be remove or role", 400);
  }

  if (isRoleChange && requestedRole !== "staff" && requestedRole !== "owner") {
    return errorResponse("Role must be staff or owner", 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return errorResponse("Authentication required", 401);
  }

  const service = createServiceRoleClient();
  const { data: target, error: targetError } = await service
    .from("business_owners")
    .select(MEMBER_COLUMNS)
    .eq("id", memberId)
    .maybeSingle();

  if (targetError) {
    console.error("team member lookup failed", {
      memberId,
      code: targetError.code,
    });
    return errorResponse("Unable to look up team member", 500);
  }

  if (!target) {
    return errorResponse("Team member not found", 404);
  }

  const member = target as MemberRow;
  const { data: owner, error: ownerError } = await service
    .from("business_owners")
    .select("id")
    .eq("business_id", member.business_id)
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (ownerError) {
    console.error("team member owner lookup failed", {
      businessId: member.business_id,
      memberId,
      code: ownerError.code,
    });
    return errorResponse("Unable to verify business access", 500);
  }

  if (!owner) {
    return errorResponse("Only a business owner can manage team members", 403);
  }

  if (isRoleChange) {
    if (member.role === requestedRole) {
      return NextResponse.json({ member: memberState(member), updated: false });
    }

    if (member.role === "owner" && requestedRole === "staff") {
      const { count, error: countError } = await service
        .from("business_owners")
        .select("id", { count: "exact", head: true })
        .eq("business_id", member.business_id)
        .eq("role", "owner");

      if (countError) {
        console.error("team member owner count failed", {
          businessId: member.business_id,
          memberId,
          code: countError.code,
        });
        return errorResponse("Unable to verify remaining owners", 500);
      }

      if ((count ?? 0) <= 1) {
        return errorResponse("The last business owner cannot be demoted", 409);
      }
    }

    const { data: updated, error: updateError } = await service
      .from("business_owners")
      .update({ role: requestedRole })
      .eq("id", member.id)
      .eq("business_id", member.business_id)
      .eq("role", member.role)
      .select(MEMBER_COLUMNS)
      .maybeSingle();

    if (updateError) {
      console.error("team member role update failed", {
        businessId: member.business_id,
        memberId,
        code: updateError.code,
      });
      return errorResponse("Unable to update team member role", 500);
    }

    if (!updated) {
      return errorResponse("Team member changed before this update completed", 409);
    }

    return NextResponse.json({
      member: memberState(updated as MemberRow),
      updated: true,
    });
  }

  if (member.role === "owner") {
    const { count, error: countError } = await service
      .from("business_owners")
      .select("id", { count: "exact", head: true })
      .eq("business_id", member.business_id)
      .eq("role", "owner");

    if (countError) {
      console.error("team member owner count failed", {
        businessId: member.business_id,
        memberId,
        code: countError.code,
      });
      return errorResponse("Unable to verify remaining owners", 500);
    }

    if ((count ?? 0) <= 1) {
      return errorResponse("The last business owner cannot be removed", 409);
    }
  }

  const {
    data: targetUserData,
    error: targetUserError,
  } = await service.auth.admin.getUserById(member.user_id);

  if (targetUserError || !targetUserData.user?.email) {
    console.error("team member email lookup failed", {
      businessId: member.business_id,
      memberId,
      code: targetUserError?.code,
    });
    return errorResponse("Unable to verify team member details", 500);
  }

  const targetEmail = targetUserData.user.email.trim().toLowerCase();
  const { data: assignedConversations, error: conversationsLookupError } = await service
    .from("conversations")
    .select("id")
    .eq("business_id", member.business_id)
    .eq("assigned_to", member.user_id);

  if (conversationsLookupError) {
    console.error("team member conversation lookup failed", {
      businessId: member.business_id,
      memberId,
      code: conversationsLookupError.code,
    });
    return errorResponse("Unable to prepare team member removal", 500);
  }

  const conversationIds = (assignedConversations ?? [])
    .map((conversation) => conversation.id)
    .filter((conversationId): conversationId is string => typeof conversationId === "string");

  const { data: pendingInvites, error: invitesLookupError } = await service
    .from("team_invites")
    .select("id")
    .eq("business_id", member.business_id)
    .eq("email", targetEmail)
    .eq("status", "pending");

  if (invitesLookupError) {
    console.error("team member invite lookup failed", {
      businessId: member.business_id,
      memberId,
      code: invitesLookupError.code,
    });
    return errorResponse("Unable to prepare team member removal", 500);
  }

  const pendingInviteIds = (pendingInvites ?? [])
    .map((invite) => invite.id)
    .filter((inviteId): inviteId is string => typeof inviteId === "string");
  const revokedAt = new Date().toISOString();
  let unassignedConversationIds: string[] = [];
  let revokedInviteIds: string[] = [];

  try {
    if (conversationIds.length > 0) {
      const { data, error } = await service
        .from("conversations")
        .update({ assigned_to: null })
        .in("id", conversationIds)
        .eq("business_id", member.business_id)
        .eq("assigned_to", member.user_id)
        .select("id");

      if (error) throw error;
      unassignedConversationIds = (data ?? [])
        .map((conversation) => conversation.id)
        .filter((conversationId): conversationId is string => typeof conversationId === "string");
      if (unassignedConversationIds.length !== conversationIds.length) {
        throw new Error("conversation assignment changed during removal");
      }
    }

    if (pendingInviteIds.length > 0) {
      const { data, error } = await service
        .from("team_invites")
        .update({ status: "revoked", revoked_at: revokedAt })
        .in("id", pendingInviteIds)
        .eq("business_id", member.business_id)
        .eq("email", targetEmail)
        .eq("status", "pending")
        .select("id");

      if (error) throw error;
      revokedInviteIds = (data ?? [])
        .map((invite) => invite.id)
        .filter((inviteId): inviteId is string => typeof inviteId === "string");
      if (revokedInviteIds.length !== pendingInviteIds.length) {
        throw new Error("invite state changed during removal");
      }
    }

    const { data: removed, error: removeError } = await service
      .from("business_owners")
      .delete()
      .eq("id", member.id)
      .eq("business_id", member.business_id)
      .eq("role", member.role)
      .select("id")
      .maybeSingle();

    if (removeError) throw removeError;
    if (!removed) throw new Error("team member changed during removal");
  } catch (error) {
    const [conversationRollback, inviteRollback] = await Promise.all([
      unassignedConversationIds.length > 0
        ? service
            .from("conversations")
            .update({ assigned_to: member.user_id })
            .in("id", unassignedConversationIds)
            .is("assigned_to", null)
        : Promise.resolve({ error: null }),
      revokedInviteIds.length > 0
        ? service
            .from("team_invites")
            .update({ status: "pending", revoked_at: null })
            .in("id", revokedInviteIds)
            .eq("business_id", member.business_id)
            .eq("email", targetEmail)
            .eq("status", "revoked")
            .eq("revoked_at", revokedAt)
        : Promise.resolve({ error: null }),
    ]);

    console.error("team member removal failed", {
      businessId: member.business_id,
      memberId,
      code: (error as { code?: string })?.code,
      rollbackError: conversationRollback.error?.code ?? inviteRollback.error?.code,
    });
    return errorResponse("Unable to remove team member", 500);
  }

  return NextResponse.json({
    member: null,
    removed: true,
    removedMember: memberState(member),
    conversationsUnassigned: conversationIds.length,
    invitesRevoked: pendingInviteIds.length,
  });
}
