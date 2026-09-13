import type { JsonFetchMetadata } from "@/lib/ai/geminiFetch";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function recordAiResponseTelemetry(input: {
  businessId: string;
  conversationId: string;
  messageId?: string | null;
  channel: "web" | "whatsapp";
  success: boolean;
  latencyMs: number;
  metadata?: JsonFetchMetadata;
  errorCode?: string;
}) {
  const client = createServiceRoleClient();
  const { error } = await client.from("ai_response_telemetry").insert({
    business_id: input.businessId,
    conversation_id: input.conversationId,
    message_id: input.messageId ?? null,
    channel: input.channel,
    provider: input.metadata?.provider ?? (process.env.AI_PROVIDER === "gemini" ? "gemini" : "groq"),
    fallback_from: input.metadata?.fallbackFrom ?? null,
    success: input.success,
    latency_ms: Math.max(0, Math.round(input.latencyMs)),
    error_code: input.errorCode ?? null,
  });
  if (error) console.error("AI telemetry insert failed:", error);
}