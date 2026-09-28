import type { BusinessContext } from "./buildContext";
import { geminiFetchJson, type ProviderName } from "./geminiFetch";

// Eight command types, deliberately -- matches exactly what's actually
// needed, not "everything Mira could theoretically do." Adding another
// means one declaration here and one case in actions.ts, nothing else
// needs to change.
const FUNCTION_DECLARATIONS = [
  {
    name: "mark_service_availability",
    description: "Mark an existing service or product as available or unavailable.",
    parameters: {
      type: "object",
      properties: {
        item_name: {
          type: "string",
          description: "The service or product name, as close as possible to how it's actually listed",
        },
        available: { type: "boolean" },
      },
      required: ["item_name", "available"],
    },
  },
  {
    name: "update_service_price",
    description: "Change the price of an existing service or product.",
    parameters: {
      type: "object",
      properties: {
        item_name: { type: "string" },
        new_price: { type: "number" },
      },
      required: ["item_name", "new_price"],
    },
  },
  {
    name: "update_product_stock",
    description: "Change how many units of a product are in stock. Only applies to products, not services -- services don't carry a stock count.",
    parameters: {
      type: "object",
      properties: {
        product_name: {
          type: "string",
          description: "The product name, as close as possible to how it's actually listed",
        },
        new_stock_quantity: {
          type: "number",
          description:
            "The resulting TOTAL stock count after this change, not a delta. If the instruction describes a relative change ('add 10 more', 'we sold 3', 'we're out'), compute the resulting total yourself using the current stock count shown in the business context below.",
        },
      },
      required: ["product_name", "new_stock_quantity"],
    },
  },
  {
    name: "create_promotion",
    description: "Create a new promotion or discount.",
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Short description, e.g. '20% off all haircuts'",
        },
        service_name: {
          type: "string",
          description: "Leave empty if the promotion applies to the whole business",
        },
        ends_at: {
          type: "string",
          description: "End date in YYYY-MM-DD, only if one was actually mentioned",
        },
      },
      required: ["description"],
    },
  },
  {
    name: "update_hours",
    description: "Change the opening/closing time for one day of the week, or mark it closed.",
    parameters: {
      type: "object",
      properties: {
        day: { type: "string", description: "Day of the week, e.g. 'Monday'" },
        closed: { type: "boolean" },
        opens_at: { type: "string", description: "24-hour HH:MM, required unless closed" },
        closes_at: { type: "string", description: "24-hour HH:MM, required unless closed" },
      },
      required: ["day"],
    },
  },
  {
    name: "add_faq",
    description: "Add a new frequently asked question and its answer.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string" },
        answer: { type: "string" },
      },
      required: ["question", "answer"],
    },
  },
  {
    name: "create_service",
    description: "Add a brand new service that doesn't exist yet. Only use this when the instruction is clearly about adding something new, not changing an existing one.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        price: { type: "number", description: "Leave unset if no price was mentioned." },
      },
      required: ["name"],
    },
  },
  {
    name: "create_product",
    description: "Add a brand new product that doesn't exist yet. Only use this when the instruction is clearly about adding something new, not changing an existing one.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        price: { type: "number" },
        stock_quantity: { type: "number", description: "Leave unset if no starting stock count was mentioned." },
      },
      required: ["name", "price"],
    },
  },
];

// Names any caller can pass to parseCommand's allowedTools -- kept as a
// named export so a restricted surface (like the portal's inventory
// assistant) can reference "update_product_stock" etc. without
// retyping the string and risking a typo silently allowing nothing.
export const COMMAND_NAMES = FUNCTION_DECLARATIONS.map((f) => f.name);

// The subset relevant to "inventory" in the everyday sense a shop owner
// means it: what's in stock, what it costs, whether it's for sale right
// now, and adding a new product. Deliberately excludes create_service --
// the portal's inventory assistant is scoped to products, not services,
// same as update_product_stock already was -- and create_promotion/
// update_hours/add_faq, not because they couldn't also be owner-facing
// eventually, but because scoping the model's own tool choices this
// tightly means it physically cannot suggest an out-of-scope action,
// rather than relying on the caller to reject one after the fact.
export const INVENTORY_COMMAND_NAMES = [
  "mark_service_availability",
  "update_service_price",
  "update_product_stock",
  "create_product",
];

// 400 tokens -- was 200 until tonight, doubled for the same reason as
// generateReply.ts: enough headroom that a genuine explanatory
// fallback ("I can help with X, Y, Z...") can't get cut off mid-sentence.
const MAX_OUTPUT_TOKENS = 400;

export type ParsedCommand =
  | { kind: "function"; name: string; args: Record<string, unknown> }
  | { kind: "text"; text: string };

// Verified against Google's current docs before writing this. One
// detail I'm moderately (not fully) confident on: function_declarations
// as snake_case in the raw request body, by analogy with system_instruction,
// which I confirmed directly. If wrong, this fails loudly with a clear
// 400 from Gemini, not silently -- that's a safe kind of uncertainty to
// have shipped, worth fixing on sight rather than blind guessing further.
//
// allowedTools optionally restricts which of the declarations above the
// model is even offered -- omitted (the admin Command Center's case)
// means all of them, exactly as before this parameter existed.
// preferredProvider optionally overrides which LLM provider handles this
// call (see businesses.command_agent_provider) -- omitted falls back to
// the platform-wide AI_PROVIDER env var, same as before this parameter
// existed. Either way, the automatic groq<->gemini fallback in
// geminiFetchJsonWithMetadata still applies if the chosen provider's
// call fails.
export async function parseCommand(
  instruction: string,
  context: BusinessContext,
  allowedTools?: string[],
  preferredProvider?: ProviderName
): Promise<ParsedCommand> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY is not set.");

  const declarations = allowedTools
    ? FUNCTION_DECLARATIONS.filter((f) => allowedTools.includes(f.name))
    : FUNCTION_DECLARATIONS;

  const businessName = context.business?.name ?? "this business";
  const systemPrompt = `You help manage "${businessName}" by turning plain instructions into one of the available actions. Match names against the business's ACTUAL current data below as exactly as you can -- never invent a service, FAQ, or anything else that isn't listed there.

BUSINESS CONTEXT:
${context.contextText}

If the instruction doesn't clearly match one of the available actions, respond in plain text explaining what you can help with instead of guessing at one.`;

  const data = (await geminiFetchJson(
    apiKey,
    {
      contents: [{ role: "user", parts: [{ text: instruction }] }],
      system_instruction: { parts: [{ text: systemPrompt }] },
      tools: [{ function_declarations: declarations }],
      generation_config: { max_output_tokens: MAX_OUTPUT_TOKENS },
    },
    preferredProvider
  )) as {
    candidates?: { content?: { parts?: { text?: string; functionCall?: { name?: string; args?: Record<string, unknown> } }[] } }[];
  };

  const part = data.candidates?.[0]?.content?.parts?.[0];

  if (part?.functionCall?.name) {
    return { kind: "function", name: part.functionCall.name, args: part.functionCall.args ?? {} };
  }

  return { kind: "text", text: part?.text ?? "I'm not sure how to help with that." };
}
