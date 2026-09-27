import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase's OAuth (and email-link) redirect target: Google sends the user
// back here with a `code` param, which this route exchanges for a session
// (setting the session cookie via lib/supabase/server.ts's setAll), then
// forwards them on to wherever they were headed.
//
// `next` mirrors the same-origin-only pattern already used in
// app/portal/login/page.tsx's getSafeRedirect -- a relative path only, so
// this can never be turned into an open redirect via the query string.
function safeNext(nextParam: string | null): string {
  if (!nextParam || !nextParam.startsWith("/") || nextParam.startsWith("//")) {
    return "/portal";
  }
  return nextParam;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // A password signup (app/portal/signup) collects the business name
      // BEFORE creating the auth user, so provision_new_business always
      // runs before the user reaches /portal. Google skips that step
      // entirely -- the account can exist with zero businesses. Route a
      // first-time Google sign-in (one with no business_owners row yet)
      // to collect a business name, rather than landing them on
      // /portal's "no business linked yet" dead end. An existing Google
      // user signing back in already has a business and skips this.
      if (next === "/portal" || next === "/portal/signup/complete") {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: existing } = await supabase
            .from("business_owners")
            .select("business_id")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle();
          if (!existing) {
            return NextResponse.redirect(new URL("/portal/signup/business-name", url.origin));
          }
        }
      }
      return NextResponse.redirect(new URL(next, url.origin));
    }
    console.error("OAuth code exchange failed:", error);
  }

  const failure = new URL("/login", url.origin);
  failure.searchParams.set("error", "oauth");
  return NextResponse.redirect(failure);
}
