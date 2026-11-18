import { Icon } from "@/components/site/icons";
import type { BusinessProfile } from "@/lib/chat/profile";

const HEADING = "mb-3 text-[12px] font-medium uppercase tracking-wide text-muted";

// The left-hand panel of the full-screen business page on a wide screen: who the business is, when it is
// open, where else to find it, what is on offer and what it sells. Everything the chat on the right could
// answer is also tappable here, so a visitor can start with a question already worded for them.
export function BusinessSidebar({
  profile,
  businessName,
  initial,
  statusText,
  closed,
  accentFill,
  onAsk,
  disabled,
}: {
  profile: BusinessProfile;
  businessName: string;
  initial: string;
  statusText: string;
  closed: boolean;
  accentFill: string;
  onAsk: (question: string) => void;
  disabled: boolean;
}) {
  const { description, links, week, promotions, products, faqs, policies } = profile;
  const askRows = [
    ...faqs.map((question) => ({ label: question, ask: question })),
    ...policies.map((title) => ({ label: title, ask: `Tell me about ${title}` })),
  ];
  return (
    <div className="flex flex-col gap-8 px-8 py-8">
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className={`grid size-14 shrink-0 place-items-center rounded-full text-xl font-semibold ${accentFill}`}>
          {initial}
        </span>
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight">{businessName}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <span className={`size-1.5 rounded-full ${closed ? "bg-line" : "bg-lime-3"}`} />
            {statusText}
          </p>
        </div>
      </div>

      {description && <p className="text-[15px] leading-relaxed text-ink-2">{description}</p>}

      {links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[13px] text-ink-2 transition-colors hover:border-ink/30"
            >
              {link.label}
              <Icon name="arrowUpRight" size={13} />
            </a>
          ))}
        </div>
      )}

      {week && (
        <section aria-label="Opening hours">
          <h2 className={HEADING}>Opening hours</h2>
          <ul className="flex flex-col gap-1 text-[14px]">
            {week.map((row) => (
              <li
                key={row.day}
                className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${row.today ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-2"}`}
              >
                <span className="flex items-center gap-2">
                  {row.day}
                  {row.today && <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${accentFill}`}>Today</span>}
                </span>
                <span className={row.hours === "Closed" ? "text-muted" : ""}>{row.hours}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {promotions.length > 0 && (
        <section aria-label="Offers">
          <h2 className={HEADING}>Offers</h2>
          <ul className="flex flex-col gap-2">
            {promotions.map((text) => (
              <li key={text} className="flex gap-2.5 rounded-[18px] bg-lime px-4 py-3 text-[14px] leading-snug text-ink">
                <Icon name="tag" size={15} className="mt-0.5 shrink-0" />
                {text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {products.length > 0 && (
        <section aria-label="Products">
          <h2 className={HEADING}>Products</h2>
          <div className="grid grid-cols-2 gap-3">
            {products.map((product) => (
              <button
                key={product.id}
                type="button"
                disabled={disabled}
                onClick={() => onAsk(`Tell me about ${product.name}`)}
                className="overflow-hidden rounded-[18px] border border-line bg-surface text-left transition-colors hover:border-ink/30 disabled:opacity-60"
              >
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.imageUrl} alt="" loading="lazy" className="h-28 w-full object-cover" />
                ) : (
                  <span className="grid h-28 w-full place-items-center bg-mist text-muted">
                    <Icon name="box" size={24} />
                  </span>
                )}
                <span className="block truncate px-3 pt-2 text-[13px] font-medium text-ink">{product.name}</span>
                <span className="block px-3 pb-2.5 text-[12px] text-muted">{product.priceLabel}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {askRows.length > 0 && (
        <section aria-label="Good to know">
          <h2 className={HEADING}>Good to know</h2>
          <ul className="flex flex-col gap-2">
            {askRows.map((row) => (
              <li key={row.label}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onAsk(row.ask)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left text-[14px] text-ink transition-colors hover:border-ink/30 disabled:opacity-60"
                >
                  {row.label}
                  <Icon name="arrow" size={14} className="shrink-0 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
