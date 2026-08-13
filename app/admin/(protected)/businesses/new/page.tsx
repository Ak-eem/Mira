"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBusiness } from "./actions";

export default function NewBusinessPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await createBusiness({ name, slug, currency });

    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-xl font-semibold">New business</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Name</label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Fresh Cuts"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Slug <span className="font-normal text-slate-400">— used in /chat/slug</span>
          </label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="fresh-cuts"
            pattern="[a-z0-9-]+"
            title="lowercase letters, numbers, and hyphens only"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Currency</label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create business"}
        </button>
      </form>
    </div>
  );
}
