import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";

export default async function PortalHomePage() {
  const owner = await getCurrentBusinessOwner();
  if (!owner) redirect("/portal/login"); // layout already guards this; satisfies TS

  if (owner.businesses.length === 1) {
    redirect(`/portal/${owner.businesses[0].id}`);
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Your businesses</h1>
      <ul className="space-y-2">
        {owner.businesses.map((b) => (
          <li key={b.id}>
            <Link
              href={`/portal/${b.id}`}
              className="block rounded border border-slate-200 bg-white px-4 py-3 hover:border-accent"
            >
              {b.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
