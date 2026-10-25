import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { redirect } from "next/navigation";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";

export default async function PortalHomePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PortalHomeContent />
    </div>
  );
}

async function PortalHomeContent() {
  const owner = await getCurrentBusinessOwner();

  if (!owner) {
    return (
      <div className="ui-card !p-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          No business linked yet
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">
          You are signed in, but this account is not linked to a Mira business. Ask your Mira contact or an administrator to link your account, then sign in again.
        </p>
        <Link
          href="/portal/login"
          className="mt-6 inline-flex ui-btn ui-btn-primary"
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
      <PageHeader title="Your businesses" />
      <ul className="space-y-2">
        {owner.businesses.map((business) => (
          <li key={business.id}>
            <Link
              href={`/portal/${business.id}`}
              className="ui-card"
            >
              {business.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
