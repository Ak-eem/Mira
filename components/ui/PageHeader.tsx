import type { ReactNode } from "react";

/** One large title per screen, a quiet subtitle, and (optionally) the screen's main action on the right. */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="ui-enter mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="ui-title">{title}</h1>
        {subtitle && <p className="ui-subtitle">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
