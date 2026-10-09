"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, ArrowUpDown, ChevronDown, ChevronUp, Search } from "lucide-react";
import { Badge } from "@/components/site/ui";
import { naira } from "@/lib/site/format";

// Rows and columns are plain data (not functions) so a Server Component can pass
// them straight in. Each column declares how its cell is drawn via `kind`.
export type Kind = "customer" | "text" | "number" | "money" | "status" | "when";
export type Column = { key: string; header: string; kind: Kind; sortable?: boolean; align?: "right" };
export type Row = { id: string; href?: string } & Record<string, string | number | boolean | null | undefined>;

const STATUS: Record<string, { label: string; tone: "neutral" | "lime" | "ink" | "danger" }> = {
  "needs-you": { label: "Needs you", tone: "lime" },
  handled: { label: "Handled by Mira", tone: "neutral" },
  placed: { label: "Placed", tone: "lime" },
  shipped: { label: "Shipped", tone: "neutral" },
  delivered: { label: "Delivered", tone: "ink" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

const whenFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function initials(label: string): string {
  return (label.match(/[A-Za-z]/g) ?? ["#"]).slice(0, 2).join("").toUpperCase();
}

function Cell({ column, row }: { column: Column; row: Row }) {
  const value = row[column.key];
  switch (column.kind) {
    case "customer":
      return (
        <span className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lime text-xs font-semibold text-ink">
            {initials(String(value ?? ""))}
          </span>
          <span className="truncate font-medium text-ink">{String(value ?? "—")}</span>
        </span>
      );
    case "money":
      return <span className="tabular-nums text-ink">{naira(Number(value ?? 0))}</span>;
    case "number":
      return <span className="tabular-nums text-ink">{Number(value ?? 0).toLocaleString("en-NG")}</span>;
    case "when":
      return <span className="whitespace-nowrap text-muted">{value ? whenFormat.format(new Date(String(value))) : "—"}</span>;
    case "status": {
      const status = STATUS[String(value)] ?? { label: String(value ?? "—"), tone: "neutral" as const };
      return <Badge tone={status.tone}>{status.label}</Badge>;
    }
    default:
      return <span className="truncate text-ink-2">{String(value ?? "—")}</span>;
  }
}

export function DataTable({
  title,
  action,
  columns,
  rows,
  filterPlaceholder,
  emptyMessage,
}: {
  title: string;
  action?: { href: string; label: string };
  columns: Column[];
  rows: Row[];
  filterPlaceholder: string;
  emptyMessage: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let result = needle
      ? rows.filter((row) => columns.some((c) => c.kind !== "when" && String(row[c.key] ?? "").toLowerCase().includes(needle)))
      : rows;
    if (sort) {
      const dir = sort.dir === "asc" ? 1 : -1;
      result = [...result].sort((a, b) => {
        const x = a[sort.key];
        const y = b[sort.key];
        if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
        return String(x ?? "").localeCompare(String(y ?? "")) * dir;
      });
    }
    return result;
  }, [rows, columns, query, sort]);

  const hasLinks = rows.some((row) => row.href);
  const toggleSort = (column: Column) => {
    if (!column.sortable) return;
    setSort((current) => current?.key === column.key && current.dir === "asc"
      ? { key: column.key, dir: "desc" }
      : { key: column.key, dir: "asc" });
  };

  return (
    <section className="glass-panel min-w-0 overflow-hidden rounded-2xl" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-5 sm:px-5">
        <h2 className="min-w-0 break-words font-medium text-ink">{title}</h2>
        {action && (
          <Link href={action.href} className="shrink-0 text-sm font-medium text-ink hover:underline">
            {action.label}
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="px-4 pb-6 pt-3 text-sm text-muted sm:px-5">{emptyMessage}</p>
      ) : (
        <>
          <div className="px-4 pt-3 sm:px-5">
            <label className="relative block">
              <span className="sr-only">{filterPlaceholder}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={filterPlaceholder}
                className="w-full min-w-0 rounded-xl border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
              />
            </label>
          </div>

          <div className="mt-2 flex gap-2 overflow-x-auto px-4 py-2 sm:hidden" aria-label="Sort dashboard items">
            {columns.filter((column) => column.sortable).map((column) => {
              const active = sort?.key === column.key;
              const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ChevronUp : ChevronDown;
              return (
                <button
                  key={column.key}
                  type="button"
                  onClick={() => toggleSort(column)}
                  aria-pressed={active}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink"
                >
                  {column.header}
                  <Icon className="h-3 w-3" aria-hidden="true" />
                </button>
              );
            })}
          </div>

          <ul className="divide-y divide-line px-4 sm:hidden">
            {visible.map((row) => (
              <li key={row.id} className="min-w-0 py-3">
                <dl className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-3">
                  {columns.map((column) => (
                    <div key={column.key} className="min-w-0">
                      <dt className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">{column.header}</dt>
                      <dd className="min-w-0 overflow-hidden text-sm text-ink">
                        <Cell column={column} row={row} />
                      </dd>
                    </div>
                  ))}
                </dl>
                {row.href && (
                  <Link href={row.href} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ink hover:underline">
                    Open item <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only"> in {title.toLowerCase()}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {visible.length === 0 && <p className="px-4 py-4 text-sm text-muted sm:hidden">Nothing matches &ldquo;{query}&rdquo;.</p>}

          <div className="mt-3 hidden min-w-0 overflow-x-auto sm:block">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="border-y border-line text-xs text-muted">
                  {columns.map((column) => {
                    const active = sort?.key === column.key;
                    const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ChevronUp : ChevronDown;
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                        className={`px-5 py-2.5 font-medium ${column.align === "right" ? "text-right" : ""}`}
                      >
                        {column.sortable ? (
                          <button type="button" onClick={() => toggleSort(column)} className="inline-flex items-center gap-1 hover:text-ink">
                            {column.header}
                            <Icon className="h-3 w-3" aria-hidden="true" />
                          </button>
                        ) : (
                          column.header
                        )}
                      </th>
                    );
                  })}
                  {hasLinks && <th scope="col" className="w-10 px-5 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((row) => (
                  <tr key={row.id} className="transition hover:bg-mist/60">
                    {columns.map((column) => (
                      <td key={column.key} className={`max-w-[14rem] px-5 py-3 ${column.align === "right" ? "text-right" : ""}`}>
                        <Cell column={column} row={row} />
                      </td>
                    ))}
                    {hasLinks && (
                      <td className="px-5 py-3 text-right">
                        {row.href && (
                          <Link href={row.href} aria-label={`Open ${title.toLowerCase()} item`} className="inline-flex text-muted hover:text-ink">
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                          </Link>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length === 0 && <p className="px-5 py-4 text-sm text-muted">Nothing matches &ldquo;{query}&rdquo;.</p>}
          </div>
        </>
      )}
    </section>
  );
}
