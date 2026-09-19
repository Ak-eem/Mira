import { NextResponse } from 'next/server';
import { getPlanConfig, verifyPaystackTransaction } from '@/lib/paystack';
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
  if (typeof metadata.business_id !== 'string' || !metadata.business_id) return NextResponse.json({ error: 'Missing business metadata' }, { status: 400 });
  if (String(data.currency).toUpperCase() !== 'NGN' || String(data.reference) !== reference) return NextResponse.json({ error: 'Invalid payment details' }, { status: 400 });
  if (metadata.plan !== 'base' || typeof metadata.promo !== 'boolean') return NextResponse.json({ error: 'Invalid payment plan metadata' }, { status: 400 });

  const { data: ownership, error: ownershipError } = await supabase
    .from('business_owners')
    .select('business_id')
    .eq('business_id', metadata.business_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (ownershipError) {
    console.error('Paystack ownership lookup failed', ownershipError);
    return NextResponse.json({ error: 'Unable to verify business ownership' }, { status: 500 });
  }
  if (!ownership) return NextResponse.json({ error: 'Payment business does not belong to this user' }, { status: 403 });

  let config;
  try { config = getPlanConfig('base', metadata.promo); } catch { return NextResponse.json({ error: 'Invalid plan configuration' }, { status: 400 }); }
  if (data.amount !== config.amountKobo) return NextResponse.json({ error: 'Payment amount does not match plan' }, { status: 400 });

  const expiresAt = new Date(Date.now() + config.durationDays * 24 * 60 * 60 * 1000).toISOString();
  const { error: rpcError } = await createServiceRoleClient().rpc('activate_paystack_subscription', { p_business_id: metadata.business_id, p_reference: reference, p_amount: data.amount, p_expires_at: expiresAt, p_expected_amount_kobo: config.amountKobo, p_plan: 'base' });
  if (rpcError) { console.error('Subscription activation RPC failed', rpcError); return NextResponse.json({ error: 'Subscription activation failed' }, { status: 500 }); }
  return NextResponse.json({ success: true, status, terminal: true });
}
