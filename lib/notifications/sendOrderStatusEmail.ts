import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailWithResend } from "@/lib/email/resend";
import { renderOrderStatusEmail } from "@/lib/email/templates";

type OrderStatusForEmail = "placed" | "shipped" | "delivered" | "cancelled";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://miraapp.com.ng";

/**
 * Best-effort only -- never throws. Looks up whether this customer has a
 * live (non-opted-out) email preference for this business, and if so
 * sends them an order-status email. A missing preference, a Resend
 * outage, or any other failure here should never block the order-status
 * update itself from succeeding -- same fire-and-forget spirit as
 * feedback/rating from the customer's side of the chat.
 *
 * `supabase` can be either the owner's RLS-bound client (portal actions
 * already assert business ownership before calling this, and the
 * "owners read own notification_preferences" policy covers the read) or
 * the service-role client -- both expose the same query surface.
 */
export async function sendOrderStatusEmailIfConsented(
  supabase: SupabaseClient,
  params: {
    businessId: string;
    businessName: string;
    currency: string;
    customerIdentifier: string;
    status: OrderStatusForEmail;
    items: { name: string; quantity: number }[];
    total: number | null;
  },
): Promise<void> {
  try {
    const { data: preference, error } = await supabase
      .from("customer_notification_preferences")
      .select("email, unsubscribe_token")
      .eq("business_id", params.businessId)
      .eq("customer_identifier", params.customerIdentifier)
      .is("opted_out_at", null)
      .maybeSingle();

    if (error || !preference?.email) return;

    const { subject, html } = renderOrderStatusEmail({
      businessName: params.businessName,
      status: params.status,
      items: params.items,
      total: params.total,
      currency: params.currency,
      unsubscribeUrl: `${SITE_URL}/api/notifications/unsubscribe?token=${preference.unsubscribe_token}`,
    });

    await sendEmailWithResend({ to: preference.email, subject, html });
  } catch (sendError) {
    console.error("Failed to send order-status email:", sendError);
  }
}
