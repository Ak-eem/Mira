import Link from "next/link";

export default function AdminUpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ businessId?: string }>;
}) {
  return <AdminUpgradeContent searchParams={searchParams} />;
}

async function AdminUpgradeContent({ searchParams }: { searchParams: Promise<{ businessId?: string }> }) {
  const { businessId } = await searchParams;
  return (
    <main className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="text-sm font-medium text-accent">Mira for Business</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Your trial has ended</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">Upgrade this business to restore catalog, settings, and conversation access.</p>
      <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Payment integration is not connected yet. An administrator can activate a plan from the subscription settings.</p>
      {businessId && <Link className="mt-6 inline-flex rounded bg-accent px-4 py-2 text-sm font-medium text-white" href={`/admin/businesses/${businessId}/settings`}>Open subscription settings</Link>}
    </main>
  );
}
