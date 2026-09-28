import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function SubscribeContent() {
const searchParams = useSearchParams();
const reference = searchParams.get("reference");
const [state, setState] = useState("loading");
const [error, setError] = useState("");
useEffect(() => {
if (!reference) return;
fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`)
.then(async (res) => {
if (res.status === 401) {
setState("unauthorized");
return;
}
const data = await res.json().catch(() => null);
if (data && data.success === true) {
setState("success");
} else if (data && data.status === "pending") {
setState("pending");
} else {
setState("failed");
setError(data?.error ?? "Payment could not be verified.");
}
})
.catch(() => {
setState("failed");
setError("Could not reach the payment service. Please try again.");
});
}, [reference]);
if (!reference) {
return (
<main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
<div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
<h1 className="text-xl font-semibold text-slate-900">Payment not confirmed</h1>
<p className="mt-2 text-sm text-slate-500">No payment reference found in the link.</p>
<Link href="/" className="mt-6 inline-block rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-medium text-white">Back to Mira</Link>
</div>
</main>
);
}
if (state === "loading") {
return (
<main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
<div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
<h1 className="text-xl font-semibold text-slate-900">Verifying your payment…</h1>
<p className="mt-2 text-sm text-slate-500">Confirming your subscription with Paystack.</p>
</div>
</main>
);
}
if (state === "unauthorized") {
return (
<main className="flex
min-h-screen items-center justify-center bg-slate-50 px-4">
<div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
<h1 className="text-xl font-semibold text-slate-900">Sign in to confirm</h1>
<p className="mt-2 text-sm text-slate-500">You need to be signed in to verify your payment.</p>
<Link href="/login" className="mt-6 inline-block rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-medium text-white">Sign in</Link>
</div>
</main>
);
}

if (state === "success") {
return (
<main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
<div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">✓</div>
<h1 className="mt-4 text-xl font-semibold text-slate-900">Payment confirmed!</h1>
<p className="mt-2 text-sm text-slate-500">Your subscription is active. You can now set up your business.</p>
<Link href="/portal" className="mt-6 inline-block rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white">Go to your admin</Link>
</div>
</main>
);
}

if (state === "pending") {
return (
<main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
<div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm">
<h1 className="text-xl font-semibold text-slate-900">Payment is being confirmed…</h1>
<p className="mt-2 text-sm text-slate-500">Paystack is still processing. This usually takes a few
    seconds.</p>
<button onClick={() => window.location.reload()} className="mt-6 inline-block rounded-lg bg-amber-600 px-6 py-2.5 text-sm font-medium text-white">Check again</button>
</div>
</main>
);
}

return (
<main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
<div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
<h1 className="text-xl font-semibold text-slate-900">Payment not confirmed</h1>
<p className="mt-2 text-sm text-slate-500">{error || "Something went wrong with your payment."}</p>
<Link href="/" className="mt-6 inline-block rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-medium text-white">Back to Mira</Link>
</div>
</main>
);
}

export default function SubscribePage() {
return (
<Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Loading…</div>}>
<SubscribeContent />
</Suspense>
);
}
