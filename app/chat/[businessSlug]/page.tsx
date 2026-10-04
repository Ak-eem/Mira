import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isOpenNow } from "@/lib/hours";
import { isCancelled } from "@/lib/plans";
import { BusinessNotFound } from "./BusinessNotFound";
import { ChatWindow } from "./ChatWindow";

// This page never reads cookies, unlike every admin page (which reads
// one to check who's logged in) -- reading a cookie is what tells
// Next.js "never statically cache this, render it fresh every time."
// Without that, this is the one page in the app structurally capable
// of getting served as a stale pre-rendered snapshot instead of
// re-running the query on every request. Forcing it explicitly.
export const dynamic = "force-dynamic";

// Runs separately from the page component below, so it does its own
// small lookup rather than sharing state -- the cost is one tiny query,
// worth it so a link shared to WhatsApp/Instagram shows the actual
// business name in the preview card instead of generic "Mira" for every
// business.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}): Promise<Metadata> {
  const { businessSlug } = await params;
  const supabase = createServiceRoleClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("slug", businessSlug)
    .maybeSingle();

  const { data: subscription } = business
    ? await supabase.from("business_subscriptions").select("status").eq("business_id", business.id).maybeSingle()
    : { data: null };
  if (!business || isCancelled(subscription)) {
    return { title: "Business not found", robots: { index: false, follow: false } };
  }

  const name = business.name ?? "Mira";

  return {
    title: `Chat with ${name}`,
    description: `Ask ${name} anything -- hours, prices, availability, and more.`,
  };
}

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ embed?: string }>;
}) {
  const { businessSlug } = await params;
  const { embed } = await searchParams;
  const embedMode = embed === "1";

  // Anonymous customer path -- service-role client, no user session to
  // key RLS off. business_id scoping from here on is enforced by hand.
  const supabase = createServiceRoleClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, is_active, timezone")
    .eq("slug", businessSlug)
    .maybeSingle();

  if (!business || !business.is_active) return <BusinessNotFound embed={embedMode} />;

  // A cancelled business is switched off everywhere, and looks the same as one
  // that never existed.
  const { data: subscription } = await supabase
    .from("business_subscriptions")
    .select("status")
    .eq("business_id", business.id)
    .maybeSingle();
  if (isCancelled(subscription)) return <BusinessNotFound embed={embedMode} />;

  const { data: hours } = await supabase
    .from("business_hours")
    .select("day_of_week, opens_at, closes_at")
    .eq("business_id", business.id);

  const openNow = isOpenNow(hours ?? [], business.timezone);

  return (
    <ChatWindow
      businessSlug={businessSlug}
      businessName={business.name}
      openNow={openNow}
      embedMode={embedMode}
    />
  );
}
