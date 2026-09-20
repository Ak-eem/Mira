import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: { id: string } | Promise<{ id: string }>;
};

type Membership = {
  business_id: string;
  role: string | null;
};

async function getMemberships(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data, error } = await supabase
    .from("business_members")
    .select("business_id, role")
    .eq("user_id", userId);

  if (error) {
    return { memberships: null, error };
  }

  return { memberships: (data ?? []) as Membership[], error: null };
}

async function getConversation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  businessIds: string[],
) {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, business_id, assigned_to")
    .eq("id", conversationId)
    .in("business_id", businessIds)
    .maybeSingle();

  return { conversation: data, error };
}

async function authenticate(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { supabase, user: null, memberships: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { memberships, error: membershipError } = await getMemberships(supabase, user.id);
  if (membershipError) {
    console.error("Failed to load business membership", membershipError);
    return { supabase, user: null, memberships: null, response: NextResponse.json({ error: "Internal server error" }, { status: 500 }) };
  }

  if (!memberships?.length) {
    return { supabase, user: null, memberships: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { supabase, user, memberships, response: null };
}

export async function POST(request: Request, { params }: RouteContext) {
  void request;
  const auth = await authenticate(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const businessIds = [...new Set(auth.memberships!.map((membership) => membership.business_id))];
  const { conversation, error: conversationError } = await getConversation(
    auth.supabase,
    id,
    businessIds,
  );

  if (conversationError) {
    console.error("Failed to load conversation", conversationError);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { data: claimed, error: claimError } = await auth.supabase
    .from("conversations")
    .update({ assigned_to: auth.user!.id })
    .eq("id", id)
    .eq("business_id", conversation.business_id)
    .is("assigned_to", null)
    .select("id, business_id, assigned_to")
    .maybeSingle();

  if (claimError) {
    console.error("Failed to claim conversation", claimError);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (!claimed) {
    return NextResponse.json({ error: "Conversation is already assigned" }, { status: 409 });
  }

  return NextResponse.json({ conversation: claimed }, { status: 200 });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  void request;
  const auth = await authenticate(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const businessIds = [...new Set(auth.memberships!.map((membership) => membership.business_id))];
  const { conversation, error: conversationError } = await getConversation(
    auth.supabase,
    id,
    businessIds,
  );

  if (conversationError) {
    console.error("Failed to load conversation", conversationError);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const membership = auth.memberships!.find(
    (candidate) => candidate.business_id === conversation.business_id,
  );
  const isOwner = membership?.role?.toLowerCase() === "owner";

  let deleteQuery = auth.supabase
    .from("conversations")
    .update({ assigned_to: null })
    .eq("id", id)
    .eq("business_id", conversation.business_id);

  if (!isOwner) {
    deleteQuery = deleteQuery.eq("assigned_to", auth.user!.id);
  }

  const { data: unclaimed, error: unclaimError } = await deleteQuery
    .select("id, business_id, assigned_to")
    .maybeSingle();

  if (unclaimError) {
    console.error("Failed to unclaim conversation", unclaimError);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (!unclaimed) {
    return NextResponse.json({ error: "Conversation is not assigned to you" }, { status: 409 });
  }

  return NextResponse.json({ conversation: unclaimed }, { status: 200 });
}
