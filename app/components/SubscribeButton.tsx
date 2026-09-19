'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Props = { plan: 'starter' | 'pro'; businessName: string; email: string };

export default function SubscribeButton({ plan, businessName, email }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reference = searchParams.get('reference') ?? searchParams.get('trxref');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!reference) return;
    let cancelled = false;
    async function poll() {
      for (let attempt = 0; attempt < 15 && !cancelled; attempt += 1) {
        try {
          const response = await fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`, { cache: 'no-store' });
          const result = await response.json() as { success?: boolean; status?: string; terminal?: boolean };
          if (cancelled) return;
          if (response.ok && result.success) { setStatus('Payment confirmed. Your subscription is active.'); router.refresh(); return; }
          if (result.terminal) { setStatus(`Payment ${result.status ?? 'could not be completed'}.`); return; }
          setStatus(`Payment status: ${result.status ?? 'pending'}…`);
        } catch { if (!cancelled) setStatus('Checking payment status…'); }
        if (attempt < 14) await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (!cancelled) setStatus('Payment is still being confirmed. Please refresh shortly.');
    }
    void poll();
    return () => { cancelled = true; };
  }, [reference, router]);

  async function startCheckout() {
    setLoading(true); setStatus('Starting secure checkout…');
    try {
      const response = await fetch('/api/paystack/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, plan, business_name: businessName }) });
      const result = await response.json() as { authorization_url?: string; error?: string };
      if (!response.ok || !result.authorization_url) throw new Error(result.error ?? 'Unable to start checkout');
      window.location.assign(result.authorization_url);
    } catch (cause) { setStatus(cause instanceof Error ? cause.message : 'Unable to start checkout'); setLoading(false); }
  }

  return <div><button type='button' onClick={startCheckout} disabled={loading}>{loading ? 'Opening Paystack…' : `Subscribe to ${plan}`}</button>{status ? <p role='status'>{status}</p> : null}</div>;
}
