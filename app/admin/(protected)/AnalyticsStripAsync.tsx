import { getAnalyticsSnapshot } from "@/lib/analytics/queries";
import { AnalyticsStrip } from "./AnalyticsStrip";

export async function AnalyticsStripAsync() {
  const result = await getAnalyticsSnapshot(null, "7d");
  if (result.error || !result.data) {
    return <p className="text-sm text-amber-700">Platform analytics are unavailable: {result.error?.message ?? "Unknown error"}</p>;
  }
  return <AnalyticsStrip snapshot={result.data} />;
}