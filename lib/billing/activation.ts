// Activating a subscription records how many days the payment bought (migration 0077), so a
// later refund can remove exactly those days. If the app is deployed before that migration is
// applied, the database does not know the new argument; rather than fail a real payment, retry
// without it. The payment is then recorded as "untracked" and refunded the older way.

import { isMissingFunctionError } from "./refunds";

export type ActivationParams = {
  p_business_id: string;
  p_user_id: string;
  p_reference: string;
  p_amount: number;
  p_expires_at: string;
  p_expected_amount_kobo: number;
  p_plan: string;
};

type RpcResult = PromiseLike<{ error: { code?: string; message?: string } | null }>;
type Rpc = (name: string, args: Record<string, unknown>) => RpcResult;

export async function activateWithPeriod(rpc: Rpc, params: ActivationParams, periodDays: number) {
  const first = await rpc("activate_paystack_subscription", { ...params, p_period_days: periodDays });
  if (!isMissingFunctionError(first.error)) return first;
  console.warn("activate_paystack_subscription has no p_period_days yet (migration 0077 not applied); activating without it");
  return rpc("activate_paystack_subscription", { ...params });
}
