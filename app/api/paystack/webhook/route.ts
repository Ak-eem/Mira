import { sendAlert } from '@/lib/alerts';
import { activateWithPeriod } from '@/lib/billing/activation';
import { nextPeriodEnd } from '@/lib/billing/periodEnd';
import { disputeAlert, isMissingFunctionError, parseDisputeResult, parseRefundResult, refundAlert } from '@/lib/billing/refunds';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getPlanConfig, quotedAmountKobo } from '@/lib/paystack';
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

function transactionReference(data: Record<string, unknown>): string | undefined {
  const nested = data.transaction && typeof data.transaction === 'object' ? (data.transaction as Record<string, unknown>) : {};
  return [data.transaction_reference, nested.reference, data.reference].find((value): value is string => typeof value === 'string' && value.length > 0);
}

// Best effort: a missing name only makes an alert less friendly, it must never break the webhook.
async function businessNameFor(client: ReturnType<typeof createServiceRoleClient>, businessId: string | undefined): Promise<string | null> {
  if (!businessId) return null;
  try {
    const { data } = await client.from('businesses').select('name').eq('id', businessId).maybeSingle();
    return typeof data?.name === 'string' ? data.name : null;
  } catch {
    return null;
  }
}

async function handleRefund(data: Record<string, unknown>) {
  const reference = transactionReference(data);
  if (!reference) {
    console.error('Paystack refund event without a transaction reference', data);
    return NextResponse.json({ received: true });
  }
  const refundAmount = typeof data.amount === 'number' && Number.isSafeInteger(data.amount) ? data.amount : null;
  const client = createServiceRoleClient();

  // The database works out which days this payment bought and removes exactly those (migration 0075).
  const { data: result, error } = await client.rpc('refund_paystack_payment', { p_reference: reference, p_refund_amount: refundAmount });

  if (error && isMissingFunctionError(error)) {
    // The app was deployed before migration 0075 was applied: keep the older behaviour so a refund is never ignored.
    const legacy = await client.rpc('revoke_paystack_subscription', { p_reference: reference, p_refund_amount: refundAmount });
    if (legacy.error) {
      console.error('Subscription revoke RPC failed', legacy.error);
      return NextResponse.json({ error: 'Subscription revoke failed' }, { status: 500 });
    }
    await sendAlert(client, {
      key: `refund-legacy-${reference}`,
      subject: 'Refund received: apply database migration 0075',
      lines: [`Payment: ${reference}`, 'Mira handled it the older way (cancels only if it was the latest payment). Apply 0075_paystack_refunds.sql in Supabase so refunds are handled properly and recorded.'],
      cooldownMinutes: 24 * 60,
    });
    return NextResponse.json({ received: true });
  }
  if (error) {
    console.error('Refund RPC failed', error);
    return NextResponse.json({ error: 'Refund handling failed' }, { status: 500 });
  }

  const parsed = parseRefundResult(result);
  if (!parsed) {
    console.error('Refund RPC returned an unexpected result', result);
    await sendAlert(client, {
      key: `refund-unreadable-${reference}`,
      subject: 'Refund received but the result was unreadable',
      lines: [`Payment: ${reference}`, 'Check the business subscription and the Paystack dashboard by hand.'],
      cooldownMinutes: 24 * 60,
    });
    return NextResponse.json({ received: true });
  }

  const alert = refundAlert(parsed, reference, await businessNameFor(client, parsed.businessId));
  if (alert) await sendAlert(client, alert);
  return NextResponse.json({ received: true });
}

// Chargebacks: recorded and sent to the operator, but access is deliberately not auto-revoked
// (a dispute can be won). Paystack gives a short deadline to respond, so the alert matters.
async function handleDispute(eventName: string, data: Record<string, unknown>) {
  console.warn('Paystack dispute event received', { event: eventName, data });
  const reference = transactionReference(data);
  const client = createServiceRoleClient();

  let result = null;
  if (reference) {
    const { data: raw, error } = await client.rpc('record_paystack_dispute', { p_reference: reference });
    if (error) {
      if (!isMissingFunctionError(error)) console.error('Dispute RPC failed', error);
    } else {
      result = parseDisputeResult(raw);
    }
  }
  const alert = disputeAlert(eventName, result, reference, await businessNameFor(client, result?.businessId));
  if (alert) await sendAlert(client, alert);
  return NextResponse.json({ received: true });
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
  if (event.event === 'refund.processed') return handleRefund(event.data ?? {});
  if (typeof event.event === 'string' && event.event.startsWith('charge.dispute.')) {
    return handleDispute(event.event, event.data ?? {});
  }
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
  // Honor the price quoted at checkout (metadata.amount_kobo) so a later env price change
  // can't reject a payment that was already in flight; older transactions fall back to env.
  const expectedKobo = quotedAmountKobo(metadata, config.amountKobo);
  if (data.amount !== expectedKobo) {
    // Paystack does not retry 4xx, so answering 400 here silently strands a
    // legitimate customer whenever the plan price or promo flag changed
    // between checkout and webhook: they paid, nothing activates, nobody
    // retries. 500 keeps Paystack retrying (hourly for ~72h), which recovers
    // config drift once fixed, while a genuine underpayment (the popup lets
    // the payer set the amount) simply never activates. Logged loudly so it
    // can be reconciled by hand.
    console.error('Paystack webhook: amount mismatch, not activating', { reference, businessId, received: data.amount, expected: expectedKobo, promo });
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

  // Paying early adds the new period to the end of the current one instead of replacing it.
  const { data: current } = await serviceRole.from('business_subscriptions').select('status, expires_at').eq('business_id', businessId).maybeSingle();
  const expiresAt = nextPeriodEnd({ now: Date.now(), status: current?.status ?? null, expiresAt: current?.expires_at ?? null, durationDays: config.durationDays });
  const { error } = await activateWithPeriod(
    (name, args) => serviceRole.rpc(name, args),
    { p_business_id: businessId, p_user_id: userId, p_reference: reference, p_amount: data.amount as number, p_expires_at: expiresAt, p_expected_amount_kobo: expectedKobo, p_plan: 'base' },
    config.durationDays,
  );
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
