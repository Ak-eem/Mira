import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendWhatsAppTemplate } from "./sendTemplate";
import { isWithinQuietHours } from "./quietHours";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

type Target = {
  customerIdentifier: string;
  orderId?: string;
  restockEventId?: string;
  params: string[];
};

type Rule = {
  id: string;
  business_id: string;
  trigger_type: "order_shipped" | "restock_alert" | "abandoned_cart";
  template_name: string | null;
  condition_json: { hours_threshold?: number } | null;
  businesses: { whatsapp_phone_number_id: string | null; timezone: string; name: string }[] | null;
};

export type NudgeCheckSummary = {
  rulesChecked: number;
  sent: number;
  failed: number;
  skippedQuietHours: number;
  skippedOptedOut: number;
  skippedCapped: number;
};

const RESTOCK_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export async function runNudgeCheck(): Promise<NudgeCheckSummary> {
  const supabase = createServiceRoleClient();
  const summary: NudgeCheckSummary = {
    rulesChecked: 0,
    sent: 0,
    failed: 0,
    skippedQuietHours: 0,
    skippedOptedOut: 0,
    skippedCapped: 0,
  };

  // Only businesses that actually have the paid add-on get nudged -- a
  // rule can exist (and show up in the portal) before that's true, it
  // just won't fire yet.
  const { data: subs } = await supabase
    .from("business_subscriptions")
    .select("business_id, max_nudges_per_customer_per_week")
    .eq("nudges_addon", true)
    .eq("status", "active");

  const capByBusiness = new Map((subs ?? []).map((s) => [s.business_id, s.max_nudges_per_customer_per_week]));
  if (capByBusiness.size === 0) return summary;

  const { data: rules } = await supabase
    .from("nudge_rules")
    .select("id, business_id, trigger_type, template_name, condition_json, businesses(whatsapp_phone_number_id, timezone, name)")
    .eq("is_active", true)
    .in("business_id", Array.from(capByBusiness.keys()))
    .returns<Rule[]>();

  for (const rule of rules ?? []) {
    summary.rulesChecked += 1;

    const business = Array.isArray(rule.businesses) ? rule.businesses[0] : rule.businesses;
    const phoneNumberId = business?.whatsapp_phone_number_id;
    // Nothing to send with yet -- no WhatsApp number configured, or no
    // approved template name entered for this rule.
    if (!phoneNumberId || !rule.template_name) continue;

    if (isWithinQuietHours(business?.timezone ?? "UTC")) {
      summary.skippedQuietHours += 1;
      continue;
    }

    const cap = capByBusiness.get(rule.business_id) ?? 2;
    const targets = await findEligibleTargets(supabase, rule);

    for (const target of targets) {
      if (await isOptedOut(supabase, rule.business_id, target.customerIdentifier)) {
        summary.skippedOptedOut += 1;
        continue;
      }
      if (!(await isUnderWeeklyCap(supabase, rule.business_id, target.customerIdentifier, cap))) {
        summary.skippedCapped += 1;
        continue;
      }

      const to = target.customerIdentifier.replace(/^wa_/, "");
      const messageId = await sendWhatsAppTemplate(phoneNumberId, to, rule.template_name, target.params);

      const { error: insertError } = await supabase.from("nudge_sends").insert({
        business_id: rule.business_id,
        nudge_rule_id: rule.id,
        customer_identifier: target.customerIdentifier,
        order_id: target.orderId ?? null,
        restock_event_id: target.restockEventId ?? null,
        whatsapp_message_id: messageId,
        status: messageId ? "sent" : "failed",
      });

      if (insertError) {
        // 23505 = unique_violation: another run already claimed this
        // order/restock event first. Not a real failure, just a race
        // the DB caught -- the partial unique indexes in migration
        // 0017 are the actual dedup guarantee, this check is just the
        // fast path that avoids sending in the first place.
        if (insertError.code !== "23505") summary.failed += 1;
        continue;
      }

      if (messageId) summary.sent += 1;
      else summary.failed += 1;
    }
  }

  return summary;
}

async function findEligibleTargets(supabase: ServiceClient, rule: Rule): Promise<Target[]> {
  if (rule.trigger_type === "order_shipped") {
    const { data: orders } = await supabase
      .from("orders")
      .select("id, customer_identifier")
      .eq("business_id", rule.business_id)
      .eq("status", "shipped");

    return filterAlreadySentByOrder(supabase, rule.id, orders ?? []);
  }

  if (rule.trigger_type === "abandoned_cart") {
    const hoursThreshold = rule.condition_json?.hours_threshold ?? 24;
    const cutoff = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000).toISOString();

    const { data: orders } = await supabase
      .from("orders")
      .select("id, customer_identifier")
      .eq("business_id", rule.business_id)
      .eq("status", "cart")
      .lt("status_changed_at", cutoff);

    return filterAlreadySentByOrder(supabase, rule.id, orders ?? []);
  }

  // restock_alert
  const cutoff = new Date(Date.now() - RESTOCK_LOOKBACK_MS).toISOString();
  const { data: events } = await supabase
    .from("product_restock_events")
    .select("id, product_id")
    .eq("business_id", rule.business_id)
    .gte("restocked_at", cutoff);

  const targets: Target[] = [];
  for (const event of events ?? []) {
    const { data: interested } = await supabase
      .from("product_interest")
      .select("customer_identifier")
      .eq("product_id", event.product_id);

    const seen = new Set<string>();
    for (const row of interested ?? []) {
      if (seen.has(row.customer_identifier)) continue;
      seen.add(row.customer_identifier);

      const { data: alreadySent } = await supabase
        .from("nudge_sends")
        .select("id")
        .eq("nudge_rule_id", rule.id)
        .eq("restock_event_id", event.id)
        .eq("customer_identifier", row.customer_identifier)
        .maybeSingle();
      if (alreadySent) continue;

      targets.push({ customerIdentifier: row.customer_identifier, restockEventId: event.id, params: [] });
    }
  }
  return targets;
}

async function filterAlreadySentByOrder(
  supabase: ServiceClient,
  ruleId: string,
  orders: { id: string; customer_identifier: string }[],
): Promise<Target[]> {
  const targets: Target[] = [];
  for (const order of orders) {
    const { data: alreadySent } = await supabase
      .from("nudge_sends")
      .select("id")
      .eq("nudge_rule_id", ruleId)
      .eq("order_id", order.id)
      .maybeSingle();
    if (alreadySent) continue;
    targets.push({ customerIdentifier: order.customer_identifier, orderId: order.id, params: [] });
  }
  return targets;
}

async function isOptedOut(supabase: ServiceClient, businessId: string, customerIdentifier: string): Promise<boolean> {
  const { data } = await supabase
    .from("nudge_opt_outs")
    .select("business_id")
    .eq("business_id", businessId)
    .eq("customer_identifier", customerIdentifier)
    .maybeSingle();
  return !!data;
}

async function isUnderWeeklyCap(
  supabase: ServiceClient,
  businessId: string,
  customerIdentifier: string,
  maxPerWeek: number,
): Promise<boolean> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("nudge_sends")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("customer_identifier", customerIdentifier)
    .gte("sent_at", weekAgo);
  return (count ?? 0) < maxPerWeek;
}
