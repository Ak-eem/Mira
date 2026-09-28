import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsappReply } from "@/lib/whatsapp/sendMessage";
import { sendOrderStatusEmailIfConsented } from "@/lib/notifications/sendOrderStatusEmail";
import { formatMoney, type NotifiableOrderStatus } from "@/lib/orders/status";

type NotifyParams = {
  businessId: string;
  businessName: string;
  currency: string;
  customerIdentifier: string;
  status: NotifiableOrderStatus;
  items: { name: string; quantity: number }[];
  total: number | null;
};

function whatsappText(params: NotifyParams): string {
  const { businessName, status, items, total, currency } = params;
  const summary = items.map((item) => `${item.quantity} × ${item.name}`).join(", ");
  const totalText = total != null ? ` (${formatMoney(total, currency)})` : "";
  const order = summary ? `your order of ${summary}${totalText}` : "your order";

  switch (status) {
    case "placed":
      return `${businessName}: we've received ${order}. They'll confirm it shortly.`;
    case "confirmed":
      return `${businessName}: good news, ${order} is confirmed and being prepared.`;
    case "shipped":
      return `${businessName}: ${order} is on its way. Reply DELIVERED once it arrives.`;
    case "delivered":
      return `${businessName}: ${order} was marked as delivered. Thank you!`;
    case "cancelled":
      return `${businessName}: ${order} was cancelled. Reply here if that's unexpected.`;
  }
}

/**
 * Best-effort, never throws -- the order-status change has already happened.
 *
 * WhatsApp customers (wa_<phone>) get a direct message; everyone else goes
 * through the existing consented-email path (web widget opt-in, or the
 * preference row created when an email-channel customer places an order).
 *
 * KNOWN LIMIT: this sends free-form text, which Meta only delivers inside the
 * 24-hour customer-service window. Outside it the send is rejected and logged.
 * Reaching customers after the window needs an approved template, the same
 * way Nudges works -- that's a Meta-side approval, not a code change here.
 */
export async function notifyOrderStatus(supabase: SupabaseClient, params: NotifyParams): Promise<void> {
  try {
    if (params.customerIdentifier.startsWith("wa_")) {
      const { data: business, error } = await supabase
        .from("businesses")
        .select("whatsapp_phone_number_id")
        .eq("id", params.businessId)
        .maybeSingle();
      if (error || !business?.whatsapp_phone_number_id) return;

      const phone = params.customerIdentifier.slice(3).replace(/[^0-9]/g, "");
      if (!phone) return;

      const sent = await sendWhatsappReply(business.whatsapp_phone_number_id, phone, whatsappText(params));
      if (!sent) console.error("Order-status WhatsApp ping was not delivered", { businessId: params.businessId, status: params.status });
      return;
    }

    await sendOrderStatusEmailIfConsented(supabase, params);
  } catch (error) {
    console.error("notifyOrderStatus failed:", error);
  }
}
