import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server client — runs AS the logged-in user's own session (publishable
// key + their cookies), so every query through this client is still
// subject to Row Level Security. This is what admin pages use: a real
// admin can read/write businesses and services because the
// is_platform_admin() RLS policy allows it for their session — nobody
// else can, even if application code forgets a check somewhere.
//
// Cookie handling here follows Supabase's current required pattern
// (getAll/setAll only — the older get/set/remove methods are deprecated
// and will break the session). Don't hand-edit this shape.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore since we're
            // not refreshing sessions via a proxy/middleware layer in the
            // MVP. Worst case, an admin re-logs-in when their token expires.
          }
        },
      },
    }
  );
}
