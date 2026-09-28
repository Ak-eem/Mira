import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getPlanConfig } from '@/lib/paystack';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export const runtime = 'nodejs';

// Paystack's published webhook source ranges (see
// https://paystack.com/docs/payments/webhooks/#ip-whitelisting). Kept as an
// env var, not hardcoded, since Paystack can change these; unset disables
// the check rather than blocking delivery. This is defense in depth on top
// of -- never instead of -- the HMAC signature check below, which is what
// actually proves the payload is genuine.
const ALLOWED_IPS = new Set(
  (process.env.PAYSTACK_WEBHOOK_IPS ?? '52.31.139.75,52.49.173.169,52.214.14.220')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean),
);

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || null;
}

function validSignature(raw: string, received: string | null, secret: string) {
  if (!received) return false;
  const expected = Buffer.from(createHmac('sha512', secret).update(raw).digest('hex'), 'utf8');
  const actual = Buffer.from(received, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (ALLOWED_IPS.size > 0 && (!ip || !ALLOWED_IPS.has(ip))) {
    console.error('Paystack webhook rejected: source IP not allowlisted', { ip });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
  if (data.amount !== config.amountKobo) {
    // Paystack does not retry 4xx, so answering 400 here silently strands a
    // legitimate customer whenever the plan price or promo flag changed
    // between checkout and webhook: they paid, nothing activates, nobody
    // retries. 500 keeps Paystack retrying (hourly for ~72h), which recovers
    // config drift once fixed, while a genuine underpayment (the popup lets
    // the payer set the amount) simply never activates. Logged loudly so it
    // can be reconciled by hand.
    console.error('Paystack webhook: amount mismatch, not activating', { reference, businessId, received: data.amount, expected: config.amountKobo, promo });
    return NextResponse.json({ error: 'Payment amount does not match plan' }, { status: 500 });
  }

  const serviceRole = createServiceRoleClient();

  // Paystack retries webhooks aggressively on anything but a fast 200. The
  // RPC itself is idempotent (ON CONFLICT guard keyed on business_id +
  // reference + active status), so this check changes nothing about
  // correctness -- it just answers "already applied" retries with a cheap
  // read instead of re-running verification and the RPC on every replay.
  const already = await serviceRole
    .from('business_subscriptions')
    .select('business_id')
    .eq('business_id', businessId)
    .eq('reference', reference)
    .eq('status', 'active')
    .maybeSingle();
  if (already.error) console.error('Paystack webhook idempotency check failed (continuing to RPC)', already.error);
  if (already.data) return NextResponse.json({ received: true });

  const expiresAt = new Date(Date.now() + config.durationDays * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await serviceRole.rpc('activate_paystack_subscription', { p_business_id: businessId, p_user_id: userId, p_reference: reference, p_amount: data.amount as number, p_expires_at: expiresAt, p_expected_amount_kobo: config.amountKobo, p_plan: 'base' });
  if (error) {
    // "user is no longer associated" is an expected, non-retriable outcome
    // (membership changed after checkout began) -- ack it so Paystack
    // doesn't hammer retries on something that will never succeed.
    if (error.message?.includes('no longer associated')) {
      console.warn('Paystack webhook: activation skipped, user no longer owns this business', { businessId, userId, reference });
      return NextResponse.json({ received: true });
    }
    console.error('Subscription activation RPC failed', error);
    return NextResponse.json({ error: 'Subscription activation failed' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
