"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(125,211,252,0.35),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(165,243,252,0.4),_transparent_42%)]" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="text-2xl font-semibold tracking-tight text-slate-900">
            Mira <span className="font-normal text-accent">Admin</span>
          </Link>
          <p className="mt-3 text-sm text-slate-600">Sign in to manage your businesses and customer conversations.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-[2rem] border border-white/80 bg-white/65 p-7 shadow-2xl shadow-sky-200/60 backdrop-blur-2xl sm:p-8"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-cyan-100"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-cyan-100"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-200/70 transition hover:bg-accent-dark disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-5 text-center text-sm text-slate-500">
          <p>
            Need a business account?{" "}
            <Link href="/signup" className="font-semibold text-accent transition hover:underline">
              Create one
            </Link>
          </p>
          <Link href="/admin/login" className="mt-3 inline-block text-xs text-slate-400 transition hover:text-accent">
            Existing admin login
          </Link>
        </div>
      </div>
    </main>
  );
}
