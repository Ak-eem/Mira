import "server-only";

import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { sendEmailWithResend } from "@/lib/email/resend";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const STAFF_CAP = 5;
const PUBLIC_INVITE_COLUMNS =
  "id,business_id,email,role,status,expires_at,created_at,updated_at,accepted_at,revoked_at,last_sent_at,send_count,invited_by,accepted_by";

type InviteRow = {
  id: string;
  business_id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  last_sent_at: string | null;
  send_count: number;
  invited_by: string | null;
  accepted_by: string | null;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function publicInvite(row: InviteRow, now = Date.now()) {
  const expired =
    row.status === "pending" && Date.parse(row.expires_at) <= now;

  return {
    id: row.id,
    businessId: row.business_id,
    email: row.email,
    role: row.role,
    status: expired ? "expired" : row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    lastSentAt: row.last_sent_at,
    sendCount: row.send_count,
    invitedBy: row.invited_by,
    acceptedBy: row.accepted_by,
  };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character,
  );
}

async function authenticateOwner(businessId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    } as const;
  }

  const { data: owner, error: ownerError } = await supabase
    .from("business_owners")
    .select("id")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (ownerError) {
    console.error("team invites owner lookup failed", { code: ownerError.code });
    return {
      response: NextResponse.json({ error: "Unable to verify business access" }, { status: 500 }),
    } as const;
  }

  if (!owner) {
    return {
      response: NextResponse.json({ error: "Only a business owner can manage invites" }, { status: 403 }),
    } as const;
  }

  return { user, service: createServiceRoleClient() } as const;
}

async function sendInviteEmail(
  email: string,
  businessId: string,
  token: string,
  expiresAt: string,
): Promise<boolean> {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL || !siteUrl) {
    return false;
  }

  const inviteUrl = `${siteUrl.replace(/\/$/, "")}/team/invite?businessId=${encodeURIComponent(businessId)}&token=${encodeURIComponent(token)}`;

  try {
    await sendEmailWithResend({
      to: email,
      subject: "You have been invited to join a Mira team",
      html: `<p>You have been invited to join a Mira team as staff.</p><p><a href="${escapeHtml(inviteUrl)}">Accept your invitation</a></p><p>This invitation expires on ${escapeHtml(expiresAt)}.</p>`,
    });
    return true;
  } catch (error) {
    console.error("team invite email delivery failed", {
      businessId,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return false;
  }
}

export async function GET(request: Request) {
  const businessId = new URL(request.url).searchParams.get("businessId")?.trim() ?? "";

  if (!isUuid(businessId)) {
    return NextResponse.json({ error: "A valid businessId is required" }, { status: 400 });
  }

  const auth = await authenticateOwner(businessId);
  if ("response" in auth) return auth.response;

  const { data, error } = await auth.service
    .from("team_invites")
    .select(PUBLIC_INVITE_COLUMNS)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("team invites list failed", { businessId, code: error.code });
    return NextResponse.json({ error: "Unable to list team invites" }, { status: 500 });
  }

  return NextResponse.json({ invites: ((data ?? []) as InviteRow[]).map((row) => publicInvite(row)) });
}

export async function POST(request: Request) {
  let body: { businessId?: unknown; business_id?: unknown; email?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const businessId =
    (typeof body.businessId === "string" ? body.businessId : body.business_id) as string | undefined;
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";

  if (!businessId || !isUuid(businessId.trim())) {
    return NextResponse.json({ error: "A valid businessId is required" }, { status: 400 });
  }
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  const normalizedBusinessId = businessId.trim();
  const auth = await authenticateOwner(normalizedBusinessId);
  if ("response" in auth) return auth.response;

  const ownerEmail = auth.user.email ? normalizeEmail(auth.user.email) : "";
  if (ownerEmail && ownerEmail === email) {
    return NextResponse.json({ error: "You cannot invite the business owner" }, { status: 409 });
  }

  const { data: usersData, error: usersError } = await auth.service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (usersError) {
    console.error("team invite user lookup failed", { businessId: normalizedBusinessId });
    return NextResponse.json({ error: "Unable to verify team membership" }, { status: 500 });
  }

  const invitedUser = usersData.users.find(
    (candidate) => candidate.email && normalizeEmail(candidate.email) === email,
  );

  if (invitedUser) {
    const { data: member, error: memberError } = await auth.service
      .from("business_owners")
      .select("id")
      .eq("business_id", normalizedBusinessId)
      .eq("user_id", invitedUser.id)
      .maybeSingle();

    if (memberError) {
      console.error("team invite membership lookup failed", { businessId: normalizedBusinessId });
      return NextResponse.json({ error: "Unable to verify team membership" }, { status: 500 });
    }
    if (member) {
      return NextResponse.json({ error: "This person is already a member of the business" }, { status: 409 });
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS).toISOString();

  const { data: pendingRows, error: pendingError } = await auth.service
    .from("team_invites")
    .select("id,email,expires_at,send_count")
    .eq("business_id", normalizedBusinessId)
    .eq("status", "pending");

  if (pendingError) {
    console.error("team invite pending lookup failed", { businessId: normalizedBusinessId });
    return NextResponse.json({ error: "Unable to check invite capacity" }, { status: 500 });
  }

  const pending = (pendingRows ?? []) as Array<{
    id: string;
    email: string;
    expires_at: string;
    send_count: number;
  }>;
  const existingPending = pending.find((row) => normalizeEmail(row.email) === email);
  const pendingUnexpiredCount = pending.filter(
    (row) => Date.parse(row.expires_at) > now.getTime(),
  ).length;

  const { data: staffRows, error: staffError } = await auth.service
    .from("business_owners")
    .select("user_id")
    .eq("business_id", normalizedBusinessId)
    .eq("role", "staff");

  if (staffError) {
    console.error("team invite staff count failed", { businessId: normalizedBusinessId });
    return NextResponse.json({ error: "Unable to check invite capacity" }, { status: 500 });
  }

  const acceptedStaffCount = staffRows?.length ?? 0;
  const existingPendingOccupiesCapacity =
    existingPending && Date.parse(existingPending.expires_at) > now.getTime() ? 1 : 0;

  if (
    acceptedStaffCount + pendingUnexpiredCount - existingPendingOccupiesCapacity >=
    STAFF_CAP
  ) {
    return NextResponse.json(
      { error: "The business team invite limit has been reached" },
      { status: 409 },
    );
  }

  const token = randomBytes(32).toString("hex");
  const sendCount = (existingPending?.send_count ?? 0) + 1;
  const invitePayload = {
    email,
    role: "staff",
    status: "pending",
    expires_at: expiresAt,
    invited_by: auth.user.id,
    accepted_by: null,
    accepted_at: null,
    revoked_at: null,
    last_sent_at: nowIso,
    send_count: sendCount,
    token,
  };

  let invite: InviteRow | null = null;
  let inviteError: { code?: string; message?: string } | null = null;

  if (existingPending) {
    const result = await auth.service
      .from("team_invites")
      .update(invitePayload)
      .eq("id", existingPending.id)
      .eq("business_id", normalizedBusinessId)
      .select(PUBLIC_INVITE_COLUMNS)
      .single();
    invite = result.data as InviteRow | null;
    inviteError = result.error;
  } else {
    const result = await auth.service
      .from("team_invites")
      .insert({ ...invitePayload, business_id: normalizedBusinessId })
      .select(PUBLIC_INVITE_COLUMNS)
      .single();
    invite = result.data as InviteRow | null;
    inviteError = result.error;
  }

  if (inviteError || !invite) {
    console.error("team invite save failed", {
      businessId: normalizedBusinessId,
      code: inviteError?.code,
    });
    if (inviteError?.code === "23505") {
      return NextResponse.json({ error: "An invite for this email already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to create team invite" }, { status: 500 });
  }

  const emailSent = await sendInviteEmail(email, normalizedBusinessId, token, expiresAt);

  return NextResponse.json(
    { invite: publicInvite(invite), emailSent },
    { status: existingPending ? 200 : 201 },
  );
}
