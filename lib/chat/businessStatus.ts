import { isCancelled } from "@/lib/plans";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";

type Client = ReturnType<typeof createServiceRoleClient>;

// True when the business has cancelled its subscription. Throws on a database
// error (never answers "not cancelled" by guessing) so callers retry instead of
// replying on behalf of a business that switched Mira off.
export async function isBusinessCancelled(client: Client, businessId: string): Promise<boolean> {
  const { data, error } = await client
    .from("business_subscriptions")
    .select("status")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  return isCancelled(data);
}
