import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";

export default async function PortalHomePage() {
  const owner = await getCurrentBusinessOwner();

  if (!owner) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          No business linked yet
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">
          You are signed in, but this account is not linked to a Mira business. Ask your Mira contact or an administrator to link your account, then sign in again.
        </p>
        <Link
          href="/portal/login"
          className="mt-6 inline-flex rounded bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark"
        >
          Use a different account
        </Link>
      </div>
    );
  }

  if (owner.businesses.length === 1) {
    redirect(`/portal/${owner.businesses[0].id}`);
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-slate-900">Your businesses</h1>
      <ul className="space-y-2">
        {owner.businesses.map((business) => (
          <li key={business.id}>
            <Link
              href={`/portal/${business.id}`}
              className="block rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-accent"
            >
              {business.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
