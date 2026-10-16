"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-12 text-slate-900">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.35),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(165,243,252,0.4),transparent_42%)]" />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-sm space-y-4 rounded-4xl border border-white/80 bg-white/65 p-7 shadow-2xl shadow-sky-200/60 backdrop-blur-2xl sm:p-8"
      >
        <h1 className="text-xl font-semibold tracking-tight">Mira <span className="font-normal text-accent">Admin</span></h1>
        <p className="-mt-2 text-sm text-slate-600">Platform admin sign-in.</p>

        <div>
          <label htmlFor="field-email" className="block text-sm font-medium text-slate-700">Email</label>
          <input id="field-email"
            type="email"
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-accent focus:outline-hidden focus:ring-4 focus:ring-accent/15"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="field-password" className="block text-sm font-medium text-slate-700">Password</label>
          <input id="field-password"
            type="password"
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-accent focus:outline-hidden focus:ring-4 focus:ring-accent/15"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-200/70 hover:bg-accent-dark disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
