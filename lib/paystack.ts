import 'server-only';

export type PaystackPlan = 'starter' | 'pro';
export type PaystackMetadata = { user_id: string; plan: PaystackPlan; business_name: string };
export type PaystackTransactionData = { authorization_url?: string; access_code?: string; reference: string; status: string; amount: number; currency: string; metadata?: Record<string, unknown>; [key: string]: unknown };

const API = 'https://api.paystack.co';
function env(name: string) { const value = process.env[name]?.trim(); if (!value) throw new Error(`Missing ${name}`); return value; }
function positive(name: string) { const value = Number(env(name)); if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive`); return value; }
function integer(name: string) { const value = Number(env(name)); if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`); return value; }

export function getPlanConfig(plan: unknown) {
  if (plan !== 'starter' && plan !== 'pro') throw new Error('plan must be starter or pro');
  const prefix = plan.toUpperCase();
  const amountNgn = positive(`PAYSTACK_${prefix}_AMOUNT_NGN`);
  const durationDays = integer(`PAYSTACK_${prefix}_DURATION_DAYS`);
  const amountKobo = Math.round(amountNgn * 100);
  if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) throw new Error('amount is out of range');
  return { plan, amountNgn, amountKobo, durationDays };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${env('PAYSTACK_SECRET_KEY')}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, cache: 'no-store' });
  const payload = await response.json().catch(() => null) as { status?: boolean; message?: string; data?: T } | null;
  if (!response.ok || payload?.status !== true || payload.data === undefined) throw new Error(payload?.message || `Paystack request failed (${response.status})`);
  return payload.data;
}

export async function initializePaystackTransaction(input: { email: string; userId: string; plan: PaystackPlan; businessName: string; callbackUrl?: string }) {
  const config = getPlanConfig(input.plan);
  const data = await request<PaystackTransactionData>('/transaction/initialize', { method: 'POST', body: JSON.stringify({ email: input.email, amount: config.amountKobo, currency: 'NGN', ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}), metadata: { user_id: input.userId, plan: input.plan, business_name: input.businessName } }) });
  if (!data.authorization_url || !data.reference) throw new Error('Paystack returned an incomplete transaction');
  return { authorization_url: data.authorization_url, reference: data.reference };
}

export async function verifyPaystackTransaction(reference: string) {
  const data = await request<PaystackTransactionData>(`/transaction/verify/${encodeURIComponent(reference)}`);
  return { success: data.status === 'success', status: data.status, data };
}
