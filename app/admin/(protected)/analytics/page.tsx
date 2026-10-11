import { AnalyticsPanel } from "../AnalyticsPanel";
import { timed } from "@/lib/perf";
import { ErrorNotice } from "@/components/ErrorNotice";
import { getAnalyticsSnapshot, parseAnalyticsRange } from "@/lib/analytics/queries";

export default async function MiraAnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const range = parseAnalyticsRange((await searchParams).range);
  const result = await timed("admin:analytics-snapshot", getAnalyticsSnapshot(null, range));
  if (result.error || !result.data) return <ErrorNotice what="load Mira Analytics" error={result.error ?? "Unknown error"} />;
  return <AnalyticsPanel snapshot={result.data} baseHref="/admin/analytics" />;
}
