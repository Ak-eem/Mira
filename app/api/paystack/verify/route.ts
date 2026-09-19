import { NextResponse } from 'next/server';
import { getPlanConfig, verifyPaystackTransaction, type PaystackPlan } from '@/lib/paystack';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export const runtime = 'nodejs';
const terminalStatuses = new Set(['success', 'failed', 'abandoned', 'reversed']);

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const reference = new URL(request.url).searchParams.get('reference')?.trim();
  if (!reference) return NextResponse.json({ error: 'reference is required' }, { status: 400 });
  let verification;
  try { verification = await verifyPaystackTransaction(reference); } catch (cause) { console.error('Paystack verification failed', cause); return NextResponse.json({ error: 'Unable to verify payment' }, { status: 502 }); }
  const { data, status, success } = verification;
  const terminal = terminalStatuses.has(status);
  if (!success) return NextResponse.json({ success: false, status, terminal });
  const metadata = (data.metadata && typeof data.metadata === 'object' ? data.metadata : {}) as Record<string, unknown>;
  if (metadata.user_id !== user.id) return NextResponse.json({ error: 'Payment does not belong to this user' }, { status: 403 });
  if (String(data.currency).toUpperCase() !== 'NGN') return NextResponse.json({ error: 'Payment currency is not NGN' }, { status: 400 });
  const plan = metadata.plan;
  if (plan !== 'starter' && plan !== 'pro') return NextResponse.json({ error: 'Missing payment plan' }, { status: 400 });
  let config;
  try { config = getPlanConfig(plan as PaystackPlan); } catch { return NextResponse.json({ error: 'Invalid plan configuration' }, { status: 400 }); }
  if (data.amount !== config.amountKobo) return NextResponse.json({ error: 'Payment amount does not match plan' }, { status: 400 });
  const businessName = typeof metadata.business_name === 'string' ? metadata.business_name.trim() : '';
  if (!businessName) return NextResponse.json({ error: 'Missing business name' }, { status: 400 });
  const { error: rpcError } = await createServiceRoleClient().rpc('activate_paystack_subscription', { p_user_id: user.id, p_plan: plan, p_reference: reference, p_amount: config.amountKobo, p_business_name: businessName, p_duration_days: config.durationDays });
  if (rpcError) { console.error('Subscription activation RPC failed', rpcError); return NextResponse.json({ error: 'Subscription activation failed' }, { status: 500 }); }
  return NextResponse.json({ success: true, status, terminal: true });
}
