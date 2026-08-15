import { createClient } from "./server";

export type CurrentBusinessOwner = {
  userId: string;
  email: string;
  businesses: { id: string; name: string }[];
};

// Returns the current business owner and which businesses they can
// access, or null if nobody's logged in or they own nothing. Same
// caveat as getCurrentAdmin(): this is a UX convenience for redirects
// and nav, not the security boundary -- the real boundary is the
// is_business_owner() RLS policies added in migration 0014. A session
// this function returns null for genuinely cannot read or write
// anything, regardless of what a page does with the null.
export async function getCurrentBusinessOwner(): Promise<CurrentBusinessOwner | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: memberships } = await supabase
    .from("business_owners")
    .select("business_id, businesses(id, name)")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) return null;

  // Supabase's embed for a many-to-one relation like this can come back
  // as either the single related row or (depending on how it infers the
  // join without a generated Database type here) an array containing
  // it -- flatten defensively rather than assume one shape.
  const businesses = memberships.flatMap((m) => {
    const b = m.businesses as { id: string; name: string } | { id: string; name: string }[] | null;
    if (!b) return [];
    return Array.isArray(b) ? b : [b];
  });

  if (businesses.length === 0) return null;

  return { userId: user.id, email: user.email ?? "", businesses };
}
