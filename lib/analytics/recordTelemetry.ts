import type { JsonFetchMetadata } from "@/lib/ai/geminiFetch";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function recordAiResponseTelemetry(input: {
  businessId: string;
  conversationId: string;
  messageId?: string | null;
  channel: "web" | "whatsapp" | "email";
  success: boolean;
  latencyMs: number;
  metadata?: JsonFetchMetadata;
  errorCode?: string;
  errorMessage?: string | null;
  /** Which provider failed, when known (the env default is only a guess). */
  provider?: string | null;
}) {
  const client = createServiceRoleClient();
  const row = {
    business_id: input.businessId,
    conversation_id: input.conversationId,
    message_id: input.messageId ?? null,
    channel: input.channel,
    provider: input.provider ?? input.metadata?.provider ?? (process.env.AI_PROVIDER === "gemini" ? "gemini" : "groq"),
    fallback_from: input.metadata?.fallbackFrom ?? null,
    success: input.success,
    latency_ms: Math.max(0, Math.round(input.latencyMs)),
    input_tokens: input.metadata?.inputTokens ?? null,
    output_tokens: input.metadata?.outputTokens ?? null,
    error_code: input.errorCode ?? null,
  };
  const errorMessage = input.errorMessage ? input.errorMessage.slice(0, 500) : null;
  let { error } = await client.from("ai_response_telemetry").insert({ ...row, error_message: errorMessage });
  // 42703 / PGRST204 = column does not exist: migration 0058 has not been applied yet. Record the row without the message
  // rather than losing it.
  if (error?.code === "42703" || error?.code === "PGRST204") ({ error } = await client.from("ai_response_telemetry").insert(row));
  if (error) console.error("AI telemetry insert failed:", error);
}