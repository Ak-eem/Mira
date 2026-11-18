import { Icon } from "@/components/site/icons";
import type { BusinessProfile } from "@/lib/chat/profile";

// The "about" section at the top of the full-screen business page, drawn in the Mira website's design.
// It is plain information plus one action: tapping a product asks the chat about it.
export function BusinessProfileSection({
  profile,
  businessName,
  onAsk,
  disabled,
}: {
  profile: BusinessProfile;
  businessName: string;
  onAsk: (question: string) => void;
  disabled: boolean;
}) {
  const { description, hoursToday, links, products } = profile;
  if (!description && !hoursToday && links.length === 0 && products.length === 0) return null;
  return (
    <section aria-label={`About ${businessName}`} className="flex flex-col gap-4 pb-1">
      {description && <p className="text-[14px] leading-snug text-ink-2">{description}</p>}

      {(hoursToday || links.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {hoursToday && (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-mist px-3 text-[13px] text-ink-2">
              <Icon name="clock" size={14} />
              Today {hoursToday}
            </span>
          )}
          {links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] text-ink-2 transition-colors hover:border-ink/30"
            >
              {link.label}
              <Icon name="arrowUpRight" size={13} />
            </a>
          ))}
        </div>
      )}

      {products.length > 0 && (
        <div>
          <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Products</h2>
          <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {products.map((product) => (
              <button
                key={product.id}
                type="button"
                disabled={disabled}
                onClick={() => onAsk(`Tell me about ${product.name}`)}
                className="w-36 shrink-0 overflow-hidden rounded-[18px] border border-line bg-surface text-left transition-colors hover:border-ink/30 disabled:opacity-60"
              >
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.imageUrl} alt="" loading="lazy" className="h-24 w-full object-cover" />
                ) : (
                  <span className="grid h-24 w-full place-items-center bg-mist text-muted">
                    <Icon name="box" size={22} />
                  </span>
                )}
                <span className="block truncate px-2.5 pt-2 text-[13px] font-medium text-ink">{product.name}</span>
                <span className="block px-2.5 pb-2 text-[12px] text-muted">{product.priceLabel}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
