import { cache } from "react";
import { createClient } from "./server";

// Per-request helpers for Server Components. React's cache() memoises for the
// duration of one render, so the layout, the page and every helper they call share
// one Supabase client and one identity check instead of each repeating it.

export const getRequestClient = cache(createClient);

export type RequestUser = { id: string; email: string };

// Identity for UX (redirects, names in the nav). getClaims() verifies the session
// token's signature locally when the project uses asymmetric JWT signing keys, and
// falls back to asking the Auth server (what getUser() always does) when it does
// not. Real authorisation stays with RLS and the middleware, so this is safe to
// call as often as a render needs. Use getUser() where an authoritative,
// revocation-aware answer matters (the admin area does).
export const getRequestUser = cache(async (): Promise<RequestUser | null> => {
  const supabase = await getRequestClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
});
