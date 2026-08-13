import { createBrowserClient } from "@supabase/ssr";

// Browser client — used from "use client" components (e.g. the login form).
// Reads/writes the session via cookies so the server client below can see
// the same session on the next request.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
