"use client";

import Link from "next/link";

type Option<T extends string> = { value: T; label: string };

/** 2 to 5 related views of the same content, with a thumb that glides to the chosen segment. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: Array<Option<T>>; value: T; onChange: (value: T) => void; label: string }) {
  const found = options.findIndex((o) => o.value === value);
  const index = Math.max(0, found);
  return (
    <div role="radiogroup" aria-label={label} className="ui-segmented" data-empty={found < 0 ? "" : undefined} style={{ "--n": options.length, "--i": index } as React.CSSProperties}>
      <span aria-hidden className="ui-segmented-thumb" />
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={option.value === value} className="ui-segment" onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The same control, but each segment is a link (filters that change the URL). */
export function SegmentedLinks({ options, current, label }: { options: Array<{ href: string; label: string; key: string }>; current: string; label: string }) {
  const index = Math.max(0, options.findIndex((o) => o.key === current));
  return (
    <nav aria-label={label} className="ui-segmented" style={{ "--n": options.length, "--i": index } as React.CSSProperties}>
      <span aria-hidden className="ui-segmented-thumb" />
      {options.map((option) => (
        <Link key={option.key} href={option.href} className="ui-segment" aria-current={option.key === current ? "page" : undefined}>
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
