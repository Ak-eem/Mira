import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit } from "@/lib/rateLimit";
import { isBusinessSwitchedOff } from "@/lib/chat/businessStatus";
import { AiProviderError } from "@/lib/ai/providerError";
import { ASK_LIMITS, askBusinessData } from "./askBusiness";

// Who may use "ask your data". Business totals, orders and revenue are more sensitive than the conversations
// staff already see, so v1 is owners only. Add "staff" here to open it up.
export const ASK_ALLOWED_ROLES: ReadonlyArray<"owner" | "staff"> = ["owner"];

export type AskApiDeps = {
  serviceClient: () => ReturnType<typeof createServiceRoleClient>;
  rateLimit: typeof checkRateLimit;
  isSwitchedOff: typeof isBusinessSwitchedOff;
  ask: typeof askBusinessData;
};

const liveDeps: AskApiDeps = {
  serviceClient: createServiceRoleClient,
  rateLimit: checkRateLimit,
  isSwitchedOff: isBusinessSwitchedOff,
  ask: askBusinessData,
};

// Order matters: cheap checks first, and nothing that costs an AI call runs before the gates.
//   1. the question is well formed        (400)
//   2. the business is not switched off   (402, or 503 if we cannot tell)  -- same gate WhatsApp and email use
//   3. the per-business hourly budget     (429, or 503 if the limiter is down)
//   4. the AI work
// The signed-in user's own Supabase client is what every read runs on; the service-role client is used only
// for the two gates above (status and rate limit), never to read the owner's data.
export async function handleAsk(supabase: SupabaseClient, businessId: string, body: unknown, deps: AskApiDeps = liveDeps) {
  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const question = typeof input.question === "string" ? input.question.trim().replace(/\s+/g, " ") : "";
  if (question.length < 3) return NextResponse.json({ error: "Type a question first." }, { status: 400 });
  if (question.length > ASK_LIMITS.questionMaxChars) {
    return NextResponse.json({ error: `Keep the question under ${ASK_LIMITS.questionMaxChars} characters.` }, { status: 400 });
  }

  let switchedOff: boolean;
  try {
    switchedOff = await deps.isSwitchedOff(deps.serviceClient(), businessId);
  } catch (error) {
    console.error("Ask your data: could not check whether the business is switched off:", error);
    return NextResponse.json({ error: "We couldn't check your plan just now. Please try again in a moment." }, { status: 503, headers: { "Retry-After": "10" } });
  }
  if (switchedOff) {
    return NextResponse.json(
      { error: "Your Mira assistant is switched off, so asking questions is paused. Renew your plan to use it again.", switchedOff: true },
      { status: 402 },
    );
  }

  const limit = await deps.rateLimit(deps.serviceClient(), `ask-data:${businessId}`, ASK_LIMITS.questionsPerBusinessPerHour, 3600);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "You've asked a lot of questions this hour. Please try again a little later." },
      { status: limit.error ? 503 : 429, headers: { "Retry-After": String(limit.retryAfterSeconds ?? 60) } },
    );
  }

  try {
    const outcome = await deps.ask(supabase, businessId, question);
    if (!outcome) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    return NextResponse.json({ kind: outcome.kind, text: outcome.text, sources: outcome.sources });
  } catch (error) {
    if (error instanceof AiProviderError) {
      console.error(`Ask your data: AI provider failed (${error.provider} ${error.kind} ${error.status ?? ""}): ${error.detail ?? ""}`);
      return NextResponse.json({ error: "The assistant couldn't be reached just now. Please try again in a moment." }, { status: 503, headers: { "Retry-After": "10" } });
    }
    console.error("Ask your data: unexpected failure:", error);
    return NextResponse.json({ error: "Something went wrong answering that. Please try again." }, { status: 500 });
  }
}
