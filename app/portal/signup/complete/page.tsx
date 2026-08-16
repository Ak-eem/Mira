import Link from "next/link";

export default function SignupCompletePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <p className="mb-8 text-center text-xl font-semibold tracking-tight text-slate-900">
          Mira <span className="font-normal text-accent">for Business</span>
        </p>

        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Account created</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Your Mira account has been created. Business setup is coming soon with payment integration.
          </p>
          <p className="mt-3 text-xs leading-5 text-slate-400">
            If email confirmation is enabled, check your inbox before signing in.
          </p>
          <Link
            href="/portal/login"
            className="mt-6 inline-flex rounded bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark"
          >
            Continue to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
