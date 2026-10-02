import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

// One-tap unsubscribe link from an order-status email. Token-based
// rather than requiring login -- the customer receiving this email
// never has a Supabase session, same reasoning as every other
// customer-facing route in this codebase using the service-role client.
// unsubscribe_token is a separate opaque value from customer_identifier
// (see 0028_customer_notification_preferences.sql), so this link can't
// be used to probe or guess anyone's identifier.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();

  if (!token) {
    return htmlResponse("This unsubscribe link is missing a token.", 400);
  }

  const client = createServiceRoleClient();
  const { error } = await client
    .from("customer_notification_preferences")
    .update({ opted_out_at: new Date().toISOString() })
    .eq("unsubscribe_token", token)
    .is("opted_out_at", null);

  if (error) {
    return htmlResponse("Something went wrong. Please try again.", 500);
  }

  // Whether this token just got opted out, or was already opted out
  // earlier (the .is() filter above matched zero rows -- e.g. the link
  // was clicked twice, or the token doesn't exist at all), the end
  // state the visitor wants is the same, so this shows the same
  // confirmation either way rather than distinguishing valid from
  // invalid/reused tokens.
  return htmlResponse("You've been unsubscribed from delivery updates. You won't get any more emails like this.", 200);
}

function htmlResponse(message: string, status: number): NextResponse {
  return new NextResponse(
    `<!doctype html>
<html lang="en">
  <body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#0f172a;">
    <div style="max-width:420px;padding:32px;text-align:center;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;">
      <p style="margin:0;font-size:15px;line-height:24px;">${message}</p>
    </div>
  </body>
</html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
