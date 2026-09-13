import { AnalyticsPanel } from "../AnalyticsPanel";
import { getAnalyticsSnapshot, parseAnalyticsRange } from "@/lib/analytics/queries";

export default async function MiraAnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const range = parseAnalyticsRange((await searchParams).range);
  const result = await getAnalyticsSnapshot(null, range);
  if (result.error || !result.data) return <p className="text-sm text-red-600">Couldn&apos;t load Mira Analytics: {result.error?.message ?? "Unknown error"}</p>;
  return <AnalyticsPanel snapshot={result.data} baseHref="/admin/analytics" />;
}
