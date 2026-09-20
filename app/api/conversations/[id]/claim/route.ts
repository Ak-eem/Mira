import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type Membership = {
  business_id: string;
  role: string;
};

type Conversation = {
  id: string;
  business_id: string;
  claimed_by: string | null;
  claimed_at: string | null;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

type AuthResult = {
  supabase: Supabase;
  user: { id: string; email?: string } | null;
  memberships: Membership[] | null;
  response: NextResponse | null;
};

async function authenticate(request: Request): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      supabase,
      user: null,
      memberships: null,
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      ),
    };
  }

  const { data, error: membershipError } = await supabase
    .from("business_owners")
    .select("business_id, role")
    .eq("user_id", user.id);

  if (membershipError) {
    return {
      supabase,
      user: null,
      memberships: null,
      response: NextResponse.json(
        { error: "Unable to verify business access" },
        { status: 500 },
      ),
    };
  }

  const memberships = (data ?? []) as Membership[];

  if (memberships.length === 0) {
    return {
      supabase,
      user: null,
      memberships: null,
      response: NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      ),
    };
  }

  void request;
  return { supabase, user, memberships, response: null };
}

async function getConversation(
  supabase: Supabase,
  conversationId: string,
  businessIds: string[],
): Promise<{ conversation: Conversation | null; error: unknown }> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, business_id, claimed_by, claimed_at")
    .eq("id", conversationId)
    .in("business_id", businessIds)
    .maybeSingle();

  return { conversation: (data as Conversation | null) ?? null, error };
}

export async function POST(
  request: Request,
  { params }: RouteContext,
) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const businessIds = [
    ...new Set(auth.memberships!.map((membership) => membership.business_id)),
  ];
  const { conversation, error: conversationError } = await getConversation(
    auth.supabase,
    id,
    businessIds,
  );

  if (conversationError) {
    return NextResponse.json(
      { error: "Unable to load conversation" },
      { status: 500 },
    );
  }

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  const claimantEmail = auth.user!.email;
  if (!claimantEmail) {
    return NextResponse.json(
      { error: "Your account has no email on file; cannot claim a conversation" },
      { status: 400 },
    );
  }

  const { data: claimed, error: claimError } = await auth.supabase
    .from("conversations")
    .update({
      claimed_by: claimantEmail,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", conversation.id)
    .eq("business_id", conversation.business_id)
    .is("claimed_by", null)
    .select("id, business_id, claimed_by, claimed_at")
    .maybeSingle();

  if (claimError) {
    return NextResponse.json(
      { error: "Unable to claim conversation" },
      { status: 500 },
    );
  }

  if (!claimed) {
    return NextResponse.json(
      { error: "Conversation is already claimed" },
      { status: 409 },
    );
  }

  return NextResponse.json({ conversation: claimed }, { status: 200 });
}

export async function DELETE(
  request: Request,
  { params }: RouteContext,
) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const businessIds = [
    ...new Set(auth.memberships!.map((membership) => membership.business_id)),
  ];
  const { conversation, error: conversationError } = await getConversation(
    auth.supabase,
    id,
    businessIds,
  );

  if (conversationError) {
    return NextResponse.json(
      { error: "Unable to load conversation" },
      { status: 500 },
    );
  }

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  if (!conversation.claimed_by) {
    return NextResponse.json(
      { error: "Conversation is not claimed" },
      { status: 409 },
    );
  }

  const membership = auth.memberships!.find(
    (candidate) => candidate.business_id === conversation.business_id,
  );
  const isOwner = membership?.role.toLowerCase() === "owner";
  const claimantEmail = auth.user!.email;

  if (!isOwner && !claimantEmail) {
    return NextResponse.json(
      { error: "Your account has no email on file; cannot verify claim ownership" },
      { status: 400 },
    );
  }

  if (!isOwner && conversation.claimed_by !== claimantEmail) {
    return NextResponse.json(
      { error: "You may only clear your own claim" },
      { status: 403 },
    );
  }

  const { data: unclaimed, error: unclaimError } = await auth.supabase
    .from("conversations")
    .update({ claimed_by: null, claimed_at: null })
    .eq("id", conversation.id)
    .eq("business_id", conversation.business_id)
    .eq("claimed_by", conversation.claimed_by)
    .select("id, business_id, claimed_by, claimed_at")
    .maybeSingle();

  if (unclaimError) {
    return NextResponse.json(
      { error: "Unable to clear conversation claim" },
      { status: 500 },
    );
  }

  if (!unclaimed) {
    return NextResponse.json(
      { error: "Conversation claim changed; retry" },
      { status: 409 },
    );
  }

  return NextResponse.json({ conversation: unclaimed }, { status: 200 });
}
