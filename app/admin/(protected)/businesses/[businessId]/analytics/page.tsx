import { AnalyticsPanel } from "../../../AnalyticsPanel";
import { getAnalyticsSnapshot, parseAnalyticsRange } from "@/lib/analytics/queries";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BusinessInsights } from "./BusinessInsights";

export default async function BusinessAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { businessId } = await params;
  const range = parseAnalyticsRange((await searchParams).range);
  const [result, businessResult] = await Promise.all([
    getAnalyticsSnapshot(businessId, range),
    (await createClient()).from("businesses").select("name").eq("id", businessId).maybeSingle(),
  ]);
  if (result.error || !result.data) return <p className="text-sm text-red-600">Couldn&apos;t load Business Analytics: {result.error?.message ?? "Unknown error"}</p>;
  if (businessResult.error) return <p className="text-sm text-red-600">Couldn&apos;t load business context: {businessResult.error.message}</p>;
  if (!businessResult.data) notFound();
  return (
    <div className="space-y-8">
      <AnalyticsPanel snapshot={result.data} baseHref={`/admin/businesses/${businessId}/analytics`} businessName={businessResult.data.name} />
      <BusinessInsights snapshot={result.data} />
    </div>
  );
}
