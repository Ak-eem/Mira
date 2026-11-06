// Gates for the portal's inventory assistant ("tell Mira what to change"), the only part of it that costs an AI
// call. It had an owner check and an on/off setting but, unlike chat, WhatsApp, email, previews and "Ask your
// data", no switched-off check and no rate limit: a business whose plan had ended could keep spending AI calls
// here, and nothing capped a runaway script. Applying a confirmed change is NOT gated: that costs no AI call, and
// an owner whose plan lapsed should still be able to fix a price.
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit } from "@/lib/rateLimit";
import { isBusinessSwitchedOff } from "@/lib/chat/businessStatus";

// One command is one AI call. An owner working through a stock list can send a lot of short commands, so this is
// generous (about one a minute, sustained) while still stopping a loop.
export const INVENTORY_COMMANDS_PER_HOUR = 60;

export type InventoryGateDeps = {
  serviceClient: () => ReturnType<typeof createServiceRoleClient>;
  isSwitchedOff: typeof isBusinessSwitchedOff;
  rateLimit: typeof checkRateLimit;
};

const liveDeps: InventoryGateDeps = {
  serviceClient: createServiceRoleClient,
  isSwitchedOff: isBusinessSwitchedOff,
  rateLimit: checkRateLimit,
};

export type InventoryGateResult = { ok: true } | { ok: false; message: string };

// Switched-off check first, so a paused business does not use up rate-limit budget. If either check cannot be
// completed we refuse (a "try again"), never guess.
export async function checkInventoryAssistantAllowed(businessId: string, deps: InventoryGateDeps = liveDeps): Promise<InventoryGateResult> {
  let switchedOff: boolean;
  try {
    switchedOff = await deps.isSwitchedOff(deps.serviceClient(), businessId);
  } catch (error) {
    console.error("Inventory assistant: could not check whether the business is switched off:", error);
    return { ok: false, message: "We couldn't check your plan just now. Please try again in a moment." };
  }
  if (switchedOff) {
    return { ok: false, message: "Your Mira assistant is switched off, so the inventory assistant is paused. Renew your plan to use it again. You can still edit your products yourself." };
  }

  try {
    const limit = await deps.rateLimit(deps.serviceClient(), `inventory-command:${businessId}`, INVENTORY_COMMANDS_PER_HOUR, 3600);
    if (!limit.allowed) {
      return {
        ok: false,
        message: limit.error
          ? "The inventory assistant is unavailable for a moment. Please try again shortly."
          : "You've sent a lot of commands this hour. Please try again a little later, or edit your products directly.",
      };
    }
  } catch (error) {
    console.error("Inventory assistant: rate limit check failed:", error);
    return { ok: false, message: "The inventory assistant is unavailable for a moment. Please try again shortly." };
  }
  return { ok: true };
}
