import { NextResponse } from 'next/server';
import { getPlanConfig, initializePaystackTransaction, type PaystackPlan } from '@/lib/paystack';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export const runtime = 'nodejs';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  let body: { email?: unknown; plan?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const email = (typeof body.email === 'string' ? body.email : user.email ?? '').trim().toLowerCase();
  if (!emailPattern.test(email)) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  if (body.plan !== undefined && body.plan !== 'base') return NextResponse.json({ error: 'plan must be base' }, { status: 400 });

  const { data: ownership, error: ownershipError } = await supabase
    .from('business_owners')
    .select('business_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (ownershipError) {
    console.error('Paystack business lookup failed', ownershipError);
    return NextResponse.json({ error: 'Unable to find business' }, { status: 500 });
  }
  if (!ownership?.business_id) return NextResponse.json({ error: 'A business is required before subscribing' }, { status: 400 });

  const serviceRole = createServiceRoleClient();
  const { count, error: countError } = await serviceRole
    .from('business_subscriptions')
    .select('business_id', { count: 'exact', head: true });
  if (countError) {
    console.error('Paystack subscription count failed', countError);
    return NextResponse.json({ error: 'Unable to initialize payment' }, { status: 502 });
  }

  const promo = (count ?? 0) < 10;
  try {
    const plan: PaystackPlan = 'base';
    getPlanConfig(plan, promo);
    const transaction = await initializePaystackTransaction({ email, userId: user.id, businessId: ownership.business_id, plan, promo, callbackUrl: `${new URL(request.url).origin}/subscribe` });
    return NextResponse.json(transaction);
  } catch (cause) {
    console.error('Paystack checkout initialization failed', cause);
    return NextResponse.json({ error: 'Unable to initialize payment' }, { status: 502 });
  }
}
