import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { PortalNav } from "./PortalNav";

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
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{business.name}</h1>
        {owner.businesses.length > 1 && (
          <Link href="/portal" className="text-sm text-slate-400 hover:text-slate-600">
            Switch business
          </Link>
        )}
      </div>
      <PortalNav businessId={businessId} />
      {children}
    </div>
  );
}
