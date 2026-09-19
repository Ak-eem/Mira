import { NextResponse } from 'next/server';
import { getPlanConfig, initializePaystackTransaction, type PaystackPlan } from '@/lib/paystack';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  let body: { email?: unknown; plan?: unknown; business_name?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const email = (typeof body.email === 'string' ? body.email : user.email ?? '').trim().toLowerCase();
  if (!emailPattern.test(email)) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  if (body.plan !== 'starter' && body.plan !== 'pro') return NextResponse.json({ error: 'plan must be starter or pro' }, { status: 400 });
  const businessName = typeof body.business_name === 'string' ? body.business_name.trim() : '';
  if (!businessName || businessName.length > 200) return NextResponse.json({ error: 'business_name is required and must be at most 200 characters' }, { status: 400 });
  try {
    getPlanConfig(body.plan);
    const transaction = await initializePaystackTransaction({ email, userId: user.id, plan: body.plan as PaystackPlan, businessName, callbackUrl: `${new URL(request.url).origin}/subscribe` });
    return NextResponse.json(transaction);
  } catch (cause) {
    console.error('Paystack checkout initialization failed', cause);
    return NextResponse.json({ error: 'Unable to initialize payment' }, { status: 502 });
  }
}
