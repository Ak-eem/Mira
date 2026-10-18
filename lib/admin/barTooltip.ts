// What the chart tooltip says for one bar: each series' value, its share of the period, and the change from the
// previous bar. Pure, so it is tested.

export type BarPoint = { label: string; value: number; secondary?: number };
export type TooltipRow = { name: string; value: number; share: string; series: "primary" | "secondary" };
export type TooltipData = { label: string; rows: TooltipRow[]; change: { text: string; direction: "up" | "down" | "flat" } | null };

const share = (value: number, total: number) => (total > 0 ? `${Math.round((value / total) * 100)}%` : "0%");

export function tooltipFor(points: BarPoint[], index: number, seriesNames: string[], suffix = ""): TooltipData | null {
  const point = points[index];
  if (!point) return null;
  const totalPrimary = points.reduce((sum, p) => sum + p.value, 0);
  const rows: TooltipRow[] = [{ name: seriesNames[0] ?? "Value", value: point.value, share: share(point.value, totalPrimary), series: "primary" }];
  if (point.secondary !== undefined) {
    const totalSecondary = points.reduce((sum, p) => sum + (p.secondary ?? 0), 0);
    rows.push({ name: seriesNames[1] ?? "Second value", value: point.secondary, share: share(point.secondary, totalSecondary), series: "secondary" });
  }
  const previous = points[index - 1];
  let change: TooltipData["change"] = null;
  if (previous) {
    const diff = point.value - previous.value;
    change = diff === 0
      ? { text: `Same as ${previous.label}`, direction: "flat" }
      : { text: `${diff > 0 ? "+" : "\u2212"}${Math.abs(diff)}${suffix} vs ${previous.label}`, direction: diff > 0 ? "up" : "down" };
  }
  return { label: point.label, rows, change };
}
