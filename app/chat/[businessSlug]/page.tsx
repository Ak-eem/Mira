import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isOpenNow } from "@/lib/hours";
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
    .select("name")
    .eq("slug", businessSlug)
    .maybeSingle();

  const name = business?.name ?? "Mira";

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

  if (!business || !business.is_active) {
    return (
      <div className={embedMode ? "flex h-full items-center justify-center" : "flex min-h-screen items-center justify-center"}>
        <p className="text-sm text-slate-500">This chat isn&apos;t available.</p>
      </div>
    );
  }

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
