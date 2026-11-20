import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpRight } from "lucide-react";
import { naira } from "@/lib/site/format";

// The last 30 days of sales at a glance: the total, how it compares with the 30 days before,
// a small trend line, and the order count and average order. When order-taking is off it
// points at the setting instead.
export function SalesCard({
  enabled,
  total,
  previous,
  orders,
  daily,
  ordersHref,
  settingsHref,
}: {
  enabled: boolean;
  total: number;
  previous: number;
  orders: number;
  daily: number[];
  ordersHref: string;
  settingsHref: string;
}) {
  if (!enabled) {
    return (
      <Link
        href={settingsHref}
        className="glass-panel glass-hover flex min-w-0 flex-col justify-between gap-6 rounded-[18px] p-5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:p-6"
      >
        <h2 className="text-sm font-semibold text-ink">Sales</h2>
        <div>
          <p className="text-sm text-muted">Let Mira take orders and your sales show up here.</p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-marigold">
            Turn on orders <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </p>
        </div>
      </Link>
    );
  }

  const pct = previous === 0 ? null : Math.round(((total - previous) / previous) * 100);
  const up = pct !== null && pct > 0;
  const down = pct !== null && pct < 0;
  const pill = pct === null ? (total > 0 ? "New" : null) : pct === 0 ? "No change" : `${up ? "+" : ""}${pct}%`;

  const W = 240;
  const H = 56;
  const max = Math.max(...daily, 1);
  const x = (i: number) => (daily.length <= 1 ? W / 2 : (i / (daily.length - 1)) * W);
  const y = (v: number) => H - 4 - (v / max) * (H - 8);
  const line = daily.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  return (
    <Link
      href={ordersHref}
      className="glass-panel glass-hover flex min-w-0 flex-col gap-5 rounded-[18px] p-5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Sales</h2>
        <span className="text-xs text-muted">last 30 days</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-3xl font-semibold tracking-tight text-ink tabular-nums">{naira(total)}</p>
        {pill ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${down ? "bg-danger/10 text-danger" : up ? "bg-lime text-ink" : "bg-mist text-muted"}`}>
            {up ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : down ? <ArrowDown className="h-3 w-3" aria-hidden="true" /> : null}
            {pill}
          </span>
        ) : null}
      </div>
      {total > 0 ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-14 w-full" preserveAspectRatio="none" role="img" aria-label="Daily sales over the last 30 days">
          <path d={`${line} L${W},${H} L0,${H} Z`} fill="var(--color-marigold)" fillOpacity={0.14} />
          <path d={line} fill="none" stroke="var(--color-marigold)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
      ) : (
        <p className="text-sm text-muted">No sales yet. They show up here after the first order.</p>
      )}
      {orders > 0 ? (
        <p className="text-xs text-muted tabular-nums">
          {orders.toLocaleString("en-NG")} {orders === 1 ? "order" : "orders"} · {naira(total / orders)} average
        </p>
      ) : null}
    </Link>
  );
}
