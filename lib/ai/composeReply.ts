import { buildMessages, buildSystemPrompt } from "@/lib/ai/buildPrompt";
import type { BusinessContext } from "@/lib/ai/buildContext";
import { generateReplyWithMetadata } from "@/lib/ai/generateReply";

export type ComposeHistoryMessage = { role: "customer" | "assistant"; content: string };

/**
 * The ONE place a reply is composed: system prompt from the business context,
 * conversation history, the customer's message, one model call.
 *
 * Both the live pipeline (lib/chat/processMessage.ts) and the preview replay
 * (lib/ai/previewReplay.ts) call this, so a preview exercises exactly the code
 * a real customer's message does -- it is not a reimplementation that can
 * quietly drift. Everything with side effects (saving messages, the order
 * flow, handoffs, WhatsApp sends) lives in the callers, never here.
 */
export async function composeReply(args: {
  context: BusinessContext;
  history: ComposeHistoryMessage[];
  message: string;
  orderTool?: boolean;
  disableTools?: boolean;
  // A guardian's matched student/fee context (see
  // getSchoolGuardianContext in lib/ai/buildContext.ts). Deliberately
  // separate from `context`: `context` is cached and shared across every
  // conversation for a business, and this is per-conversation, resolved
  // fresh on every call. It is appended to the prompt here, after
  // buildSystemPrompt runs on the cacheable context, so it can never end
  // up inside anything cached or shared with another customer.
  extraSystemContext?: string | null;
}) {
  const baseSystemPrompt = buildSystemPrompt(args.context);
  const systemPrompt = args.extraSystemContext
    ? `${baseSystemPrompt}\n\n${args.extraSystemContext}`
    : baseSystemPrompt;
  const llmMessages = buildMessages(args.history, args.message);
  return generateReplyWithMetadata(systemPrompt, llmMessages, {
    orderTool: args.orderTool,
    disableTools: args.disableTools,
  });
}
