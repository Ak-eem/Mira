import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestUser } from "@/lib/supabase/request";

export default async function SignupCompletePage() {
  // Anyone who finished signup is already signed in (password signup signs them in,
  // and so does Google), so go straight to their dashboard. The "sign in" card below
  // is only the fallback for a session that didn't carry over.
  const user = await getRequestUser();
  if (user) redirect("/portal");

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12 text-slate-900">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.35),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(165,243,252,0.4),transparent_42%)]" />
      <div className="relative w-full max-w-sm">
        <h1 className="mb-8 text-center text-2xl font-semibold tracking-tight text-slate-900">
          Mira <span className="font-normal text-accent">for Business</span>
        </h1>

        <div className="ui-card !p-6 text-center">
          <h1 className="text-lg font-semibold text-slate-900">Account created</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Your business is set up and your 14-day free trial has started. Sign in to get going.
          </p>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            If email confirmation is enabled, check your inbox before signing in.
          </p>
          <Link
            href="/portal/login"
            className="ui-btn ui-btn-primary mt-6"
          >
            Continue to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
