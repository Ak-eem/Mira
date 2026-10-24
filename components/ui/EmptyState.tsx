import type { ReactNode } from "react";

type IconName = "box" | "chat" | "list" | "clock" | "bag" | "bell" | "people";

const ICONS: Record<IconName, string[]> = {
  box: ["M21 8 12 3 3 8v8l9 5 9-5z", "M3 8l9 5 9-5", "M12 13v8"],
  chat: ["M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"],
  list: ["M8 6h12", "M8 12h12", "M8 18h12", "M4 6h.01", "M4 12h.01", "M4 18h.01"],
  clock: ["M12 7v5l3 2", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"],
  bag: ["M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z", "M3 6h18", "M16 10a4 4 0 0 1-8 0"],
  bell: ["M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9", "M13.7 21a2 2 0 0 1-3.4 0"],
  people: ["M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2", "M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M21 21v-2a4 4 0 0 0-3-3.9", "M16 3.1a4 4 0 0 1 0 7.8"],
};

/** An empty list says what belongs here, why it matters, and offers the next step. */
export function EmptyState({ icon = "list", title, description, action }: { icon?: IconName; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ui-empty ui-enter">
      <span aria-hidden className="mb-1 grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-500">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
          {ICONS[icon].map((d) => <path key={d} d={d} />)}
        </svg>
      </span>
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
      {description && <p className="ui-subtitle mt-0 max-w-sm text-center">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
