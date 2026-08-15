import type { BusinessSocialLinks } from "@/lib/types";

export type ContactLink = { label: string; url: string };

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Turns however a business owner typed these into Settings into real,
// clickable URLs. WhatsApp and Instagram get their canonical link format
// built from just a number/handle (least typing, least room for the
// owner to get the URL shape wrong); Facebook/TikTok/website are typed
// as full links already, just normalized to have a scheme.
export function buildContactLinks(links: BusinessSocialLinks | null | undefined): ContactLink[] {
  if (!links) return [];
  const out: ContactLink[] = [];

  if (links.whatsapp) {
    const digits = links.whatsapp.replace(/[^0-9]/g, "");
    if (digits) out.push({ label: "WhatsApp", url: `https://wa.me/${digits}` });
  }
  if (links.instagram) {
    const handle = links.instagram.trim().replace(/^@/, "");
    if (handle) out.push({ label: "Instagram", url: `https://instagram.com/${handle}` });
  }
  if (links.facebook?.trim()) out.push({ label: "Facebook", url: normalizeUrl(links.facebook) });
  if (links.tiktok?.trim()) out.push({ label: "TikTok", url: normalizeUrl(links.tiktok) });
  if (links.website?.trim()) out.push({ label: "Website", url: normalizeUrl(links.website) });

  return out;
}
