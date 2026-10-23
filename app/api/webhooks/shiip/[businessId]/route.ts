import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { handleShiipWebhook } from "@/lib/logistics/handleShiipWebhook";

export const runtime = "nodejs";

// Per-business URL (not one shared endpoint, unlike Paystack): each
// business connects their OWN Shiip account and configures THIS url --
// with their own businessId in the path -- as their webhook URL in their
// own Shiip dashboard. That's how we know which business's secret to
// verify against before the signature check can even run; Shiip's
// payload itself carries no business identity, only an order reference
// that's only meaningful once scoped to the right business.
//
// The actual logic lives in lib/logistics/handleShiipWebhook.ts, with the
// Supabase client and signature injected as arguments -- this route is
// just the HTTP adapter. Pulled apart specifically so the logic has real
// test coverage with a fake client (lib/logistics/handleShiipWebhook.test.ts):
// a route handler that constructs createServiceRoleClient() internally
// can't be unit tested without a live environment.
export async function POST(request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature");
  const supabase = createServiceRoleClient();

  const result = await handleShiipWebhook(supabase, { businessId, rawBody, signature });
  return NextResponse.json(result.body, { status: result.status });
}
