import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getPlanConfig } from '@/lib/paystack';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export const runtime = 'nodejs';
function validSignature(raw: string, received: string | null, secret: string) {
  if (!received) return false;
  const expected = Buffer.from(createHmac('sha512', secret).update(raw).digest('hex'), 'utf8');
  const actual = Buffer.from(received, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !validSignature(rawBody, request.headers.get('x-paystack-signature'), secret)) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  let event: { event?: unknown; data?: Record<string, unknown> };
  try { event = JSON.parse(rawBody); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (event.event !== 'charge.success') return NextResponse.json({ received: true });
  const data = event.data ?? {};
  if (data.status !== 'success' || String(data.currency).toUpperCase() !== 'NGN') return NextResponse.json({ error: 'Invalid successful NGN charge' }, { status: 400 });
  const metadata = (data.metadata && typeof data.metadata === 'object' ? data.metadata : {}) as Record<string, unknown>;
  const userId = metadata.user_id;
  const businessId = metadata.business_id;
  const reference = data.reference;
  const promo = metadata.promo;
  if (typeof userId !== 'string' || !userId || typeof businessId !== 'string' || !businessId || metadata.plan !== 'base' || typeof promo !== 'boolean' || typeof reference !== 'string' || !reference) return NextResponse.json({ error: 'Missing payment metadata' }, { status: 400 });

  let config;
  try { config = getPlanConfig('base', promo); } catch { return NextResponse.json({ error: 'Invalid plan configuration' }, { status: 400 }); }
  if (data.amount !== config.amountKobo) return NextResponse.json({ error: 'Payment amount does not match plan' }, { status: 400 });

  const expiresAt = new Date(Date.now() + config.durationDays * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await createServiceRoleClient().rpc('activate_paystack_subscription', { p_business_id: businessId, p_reference: reference, p_amount: data.amount as number, p_expires_at: expiresAt, p_expected_amount_kobo: config.amountKobo, p_plan: 'base' });
  if (error) { console.error('Subscription activation RPC failed', error); return NextResponse.json({ error: 'Subscription activation failed' }, { status: 500 }); }
  return NextResponse.json({ received: true });
}
