import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit } from "@/lib/rateLimit";
import { buildBusinessContext, type BusinessContext } from "@/lib/ai/buildContext";
import { buildSystemPrompt, buildMessages, isFallbackReply } from "@/lib/ai/buildPrompt";
import { classifyIntent } from "@/lib/ai/classifyIntent";
import { generateReplyStream } from "@/lib/ai/generateReply";
import { getOfflineGateReply } from "@/lib/chat/offlineReply";
import { getHandoffReply, isFrustrationSignal, type HandoffReason } from "@/lib/chat/handoff";
import { matchProductImages } from "@/lib/chat/matchProductImages";
import { recordProductInterest } from "@/lib/chat/recordProductInterest";

const SESSION_COOKIE = "mira_session";

function getClientIdentifier(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";
}

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(getClientIdentifier(request));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Too many messages -- try again in ${rateLimit.retryAfterSeconds}s.`,
      },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const businessSlug = body?.businessSlug as string | undefined;
  const message = body?.message as string | undefined;
  const visitorId = body?.visitorId as string | undefined;

  if (!businessSlug || !message || !message.trim()) {
    return NextResponse.json(
      { error: "businessSlug and message are required." },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, is_active")
    .eq("slug", businessSlug)
    .maybeSingle();

  if (businessError) {
    console.error("Business lookup failed:", businessError);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
  if (!business || !business.is_active) {
    return NextResponse.json({ error: "Business not found." }, { status: 404 });
  }

  // Identity comes from the widget's own client-generated visitorId, sent
  // explicitly in the request body -- NOT from reading the session cookie
  // back. The embed widget runs inside a cross-site <iframe> on the
  // business's own site (see public/embed.js), where a SameSite=Lax
  // cookie set from in there is a third-party cookie: Safari ITP and
  // Chrome's rollout both stop it from reliably round-tripping on later
  // requests. When that happened silently, every message could look like
  // a brand-new visitor with no session, and "find the open conversation
  // for this session" had nothing trustworthy to key off -- the actual
  // mechanism behind different customers' chats blurring into one
  // thread. A visitor ID that lives in the iframe's own localStorage
  // instead of a cookie isn't subject to that restriction (see
  // ChatWindow.tsx's getOrCreateVisitorId). The cookie is still set below
  // too (harmless, helps the standalone /chat page and any already-cached
  // embed.js), but it is never the thing identity is decided from anymore.
  const sessionToken = `web_${visitorId && visitorId.trim() ? visitorId.trim() : randomUUID()}`;

  const trimmedMessage = message.trim();

  let conversation;
  let isNewConversation = false;
  const { data: existingConversation, error: conversationLookupError } =
    await supabase
      .from("conversations")
      .select("id, business_id")
      .eq("business_id", business.id)
      .eq("session_token", sessionToken)
      .eq("status", "open")
      .maybeSingle();

  if (conversationLookupError) {
    console.error("Conversation lookup failed:", conversationLookupError);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }

  conversation = existingConversation;

  if (!conversation) {
    const { data: newConversation, error: convError } = await supabase
      .from("conversations")
      .insert({
        business_id: business.id,
        session_token: sessionToken,
        channel: "web",
      })
      .select("id, business_id")
      .single();

    if (convError?.code === "23505") {
      // Lost the race to open this conversation -- see migration 0009 and
      // the matching comment in lib/chat/processMessage.ts. Pick up the
      // winner's row; only the winner triggers the offline-gate reply.
      const { data: winner, error: reselectError } = await supabase
        .from("conversations")
        .select("id, business_id")
        .eq("business_id", business.id)
        .eq("session_token", sessionToken)
        .eq("status", "open")
        .single();

      if (reselectError || !winner) {
        console.error("Conversation re-select after race lost failed:", reselectError);
        return NextResponse.json(
          { error: "Could not start conversation." },
          { status: 500 },
        );
      }
      conversation = winner;
    } else if (convError || !newConversation) {
      console.error("Conversation creation failed:", convError);
      return NextResponse.json(
        { error: "Could not start conversation." },
        { status: 500 },
      );
    } else {
      conversation = newConversation;
      isNewConversation = true;
    }
  }

  if (conversation.business_id !== business.id) {
    return NextResponse.json(
      { error: "Conversation does not belong to this business." },
      { status: 403 },
    );
  }

  const { data: priorMessages, error: priorMessagesError } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .limit(20);

  if (priorMessagesError) {
    console.error("Prior messages fetch failed:", priorMessagesError);
  }

  const { error: customerInsertError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    business_id: business.id,
    role: "customer",
    content: trimmedMessage,
  });

  if (customerInsertError) {
    console.error("Customer message insert failed:", customerInsertError);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }

  const encoder = new TextEncoder();
  const conversationId = conversation.id;

  // Only the opener of a brand-new conversation can get the instant
  // closed-hours reply -- see the longer comment in processMessage.ts.
  // Streamed as a single token event to keep the same wire protocol the
  // frontend already parses, rather than a special case in ChatWindow.
  if (isNewConversation) {
    const offlineReply = await getOfflineGateReply(supabase, business.id);
    if (offlineReply) {
      const offlineStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ token: offlineReply })}\n\n`),
          );

          const { data: saved, error: insertError } = await supabase
            .from("messages")
            .insert({
              conversation_id: conversationId,
              business_id: business.id,
              role: "assistant",
              content: offlineReply,
              context_snapshot: { offlineGate: true },
            })
            .select("id")
            .single();

          if (insertError) {
            console.error("Offline reply insert failed:", insertError);
          }

          await supabase
            .from("conversations")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", conversationId);

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ done: true, messageId: saved?.id ?? null, productImages: [] })}\n\n`,
            ),
          );
          controller.close();
        },
      });

      const offlineResponse = new NextResponse(offlineStream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
      offlineResponse.cookies.set(SESSION_COOKIE, sessionToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
      });
      return offlineResponse;
    }
  }

  const intent = classifyIntent(trimmedMessage);

  let context: BusinessContext;
  try {
    context = await buildBusinessContext(business.id);
  } catch (err) {
    console.error("Failed to build AI context:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }

  const businessName = context.business?.name ?? "this business";

  // Same handoff trigger as lib/chat/processMessage.ts (the WhatsApp
  // path) -- explicit request, or Mira having already given the canned
  // fallback reply twice in a row for this conversation.
  const recentAssistantReplies = (priorMessages ?? [])
    .filter((m) => m.role === "assistant")
    .slice(-2)
    .map((m) => m.content);
  const repeatedFallback =
    recentAssistantReplies.length === 2 &&
    recentAssistantReplies.every((text) => isFallbackReply(text, businessName));
  const needsHandoff =
    intent === "human_handoff" || repeatedFallback || isFrustrationSignal(trimmedMessage);

  if (needsHandoff) {
    const { data: flaggedRows, error: flagError } = await supabase
      .from("conversations")
      .update({ needs_human: true })
      .eq("id", conversationId)
      .eq("needs_human", false)
      .select("id");

    if (flagError) {
      console.error("Failed to flag conversation for human handoff:", flagError);
    }

    const alreadyFlagged = !flagError && (flaggedRows?.length ?? 0) === 0;
    const reason: HandoffReason = intent === "human_handoff" ? "requested" : "confused";
    const handoffText = getHandoffReply(businessName, reason, alreadyFlagged);

    const handoffStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ token: handoffText })}\n\n`),
        );

        const { data: saved, error: insertError } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            business_id: business.id,
            role: "assistant",
            content: handoffText,
            context_snapshot: { handoff: true, reason },
          })
          .select("id")
          .single();

        if (insertError) {
          console.error("Handoff reply insert failed:", insertError);
        }

        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversationId);

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ done: true, messageId: saved?.id ?? null, productImages: [] })}\n\n`,
          ),
        );
        controller.close();
      },
    });

    const handoffResponse = new NextResponse(handoffStream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
    handoffResponse.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return handoffResponse;
  }

  const systemPrompt = buildSystemPrompt(context);
  const history = (priorMessages ?? []).map((m) => ({
    role: m.role as "customer" | "assistant",
    content: m.content,
  }));
  const llmMessages = buildMessages(history, trimmedMessage);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let replyText = "";

      try {
        for await (const chunk of generateReplyStream(
          systemPrompt,
          llmMessages,
        )) {
          replyText += chunk;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ token: chunk })}\n\n`),
          );
        }

        const productImages = matchProductImages(replyText, context.products);
        await recordProductInterest(supabase, business.id, sessionToken, productImages);

        const { data: saved, error: assistantInsertError } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            business_id: business.id,
            role: "assistant",
            content: replyText,
            context_snapshot: { systemPrompt, productImages },
          })
          .select("id")
          .single();

        if (assistantInsertError) {
          console.error("Assistant message insert failed:", assistantInsertError);
        }

        const { error: timestampError } = await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversationId);

        if (timestampError) {
          console.error("Conversation timestamp update failed:", timestampError);
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ done: true, messageId: saved?.id ?? null, productImages })}\n\n`,
          ),
        );
        controller.close();
      } catch (err) {
        console.error("generateReplyStream failed:", err);
        const errorMessage = "Something went wrong on our end. Please try again";

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: errorMessage })}\n\n`),
        );
        controller.close();
      }
    },
  });

  const response = new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });

  response.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return response;
}
