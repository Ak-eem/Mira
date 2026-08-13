import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client — bypasses Row Level Security entirely. Has no
// concept of "the current user" at all.
//
// SERVER-ONLY. Never import this from a "use client" component —
// SUPABASE_SERVICE_ROLE_KEY must never reach the browser bundle.
//
// Not used by the admin pages (those use server.ts and rely on RLS).
// This exists for the customer chat path — customers never get a
// Supabase session, so there's no user for RLS to key off of. Once that
// path is built, every query made with this client MUST filter by
// business_id explicitly and by hand: RLS isn't doing that job here,
// application code is.
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
