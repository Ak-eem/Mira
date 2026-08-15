import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";

export default async function PortalBusinessLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const owner = await getCurrentBusinessOwner();
  if (!owner) redirect("/portal/login");

  const business = owner.businesses.find((b) => b.id === businessId);
  if (!business) notFound(); // this owner exists, just doesn't own this specific business

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{business.name}</h1>
        {owner.businesses.length > 1 && (
          <Link href="/portal" className="text-sm text-slate-500 hover:underline">
            Switch business
          </Link>
        )}
      </div>
      <nav className="mb-6 flex gap-4 border-b border-slate-200 text-sm">
        <Link href={`/portal/${businessId}`} className="border-b-2 border-transparent px-1 pb-2 hover:border-accent">
          Dashboard
        </Link>
        <Link href={`/portal/${businessId}/conversations`} className="border-b-2 border-transparent px-1 pb-2 hover:border-accent">
          Conversations
        </Link>
        <Link href={`/portal/${businessId}/nudges`} className="border-b-2 border-transparent px-1 pb-2 hover:border-accent">
          Nudges
        </Link>
        <Link href={`/portal/${businessId}/orders`} className="border-b-2 border-transparent px-1 pb-2 hover:border-accent">
          Orders
        </Link>
      </nav>
      {children}
    </div>
  );
}
