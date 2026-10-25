import { cache } from "react";
import { getRequestClient } from "./request";

export type CurrentAdmin = {
  id: string;
  email: string;
};

// Returns the current platform admin, or null if nobody's logged in or
// they're logged in but not an admin. This is a UX convenience (so pages
// can redirect cleanly and show something in the header) — it is not the
// actual security boundary. The real boundary is the is_platform_admin()
// RLS policy: a non-admin session simply can't see or touch any rows,
// regardless of what this function returns.
export const getCurrentAdmin = cache(async (): Promise<CurrentAdmin | null> => {
  const supabase = await getRequestClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: admin } = await supabase
    .from("platform_admins")
    .select("id, email")
    .eq("id", user.id)
    .maybeSingle();

  return admin ?? null;
});
