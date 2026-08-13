import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Business } from "@/lib/types";

// Uses the RLS-respecting client (not service-role) — this query only
// returns rows because the current session passes is_platform_admin().
export default async function AdminBusinessesPage() {
  const supabase = await createClient();
  const { data: businesses, error } = await supabase
    .from("businesses")
    .select("id, name, slug, is_active")
    .order("created_at", { ascending: false })
    .returns<Pick<Business, "id" | "name" | "slug" | "is_active">[]>();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Businesses</h1>
        <Link
          href="/admin/businesses/new"
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark"
        >
          + New business
        </Link>
      </div>

      {error && (
        <p className="text-sm text-red-600">Couldn&apos;t load businesses: {error.message}</p>
      )}

      {!error && businesses?.length === 0 && (
        <p className="text-sm text-slate-500">No businesses yet — create the first one.</p>
      )}

      {!error && businesses && businesses.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {businesses.map((b) => (
            <li key={b.id}>
              <Link
                href={`/admin/businesses/${b.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium">{b.name}</p>
                  <p className="text-sm text-slate-500">/chat/{b.slug}</p>
                </div>
                <span
                  className={
                    b.is_active
                      ? "text-xs font-medium text-emerald-600"
                      : "text-xs font-medium text-slate-400"
                  }
                >
                  {b.is_active ? "Active" : "Inactive"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
