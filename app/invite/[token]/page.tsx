import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const INVITE_EXPIRY_NOW = Date.now();

type InvitePageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ error?: string }>;
};

type BusinessSummary = {
  name?: string | null;
  is_active?: boolean | null;
};

type InviteState =
  | "invalid"
  | "expired"
  | "revoked"
  | "accepted"
  | "inactive"
  | "mismatch"
  | "ready"
  | "unauthenticated";

function maskEmail(email: string) {
  const [localPart, domain] = email.trim().toLowerCase().split("@");
  if (!localPart || !domain) return "the invited email address";

  if (localPart.length === 1) {
    return `${localPart}***@${domain}`;
  }

  const middle = "*".repeat(Math.min(5, Math.max(2, localPart.length - 2)));
  return `${localPart[0]}${middle}${localPart[localPart.length - 1]}@${domain}`;
}

function actionMessage(error?: string) {
  switch (error) {
    case "mismatch":
      return "This invite is for a different email address. Sign in with the invited account to accept it.";
    case "accepted":
      return "This invite has already been accepted.";
    case "expired":
      return "This invite has expired. Ask the business owner to send a new one.";
    case "revoked":
      return "This invite is no longer available. Ask the business owner to send a new one.";
    case "unavailable":
      return "We couldn't accept this invite right now. Please try again.";
    default:
      return null;
  }
}

async function acceptInvite(formData: FormData) {
  "use server";

  const tokenValue = formData.get("token");
  if (typeof tokenValue !== "string" || !tokenValue.trim()) {
    redirect("/invite?error=unavailable");
  }

  const token = tokenValue.trim();
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";

  if (!host) {
    redirect(`/invite/${encodeURIComponent(token)}?error=unavailable`);
  }

  const cookieHeader = (await cookies())
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");

  try {
    const response = await fetch(`${protocol}://${host}/api/team/invites/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: JSON.stringify({ token }),
      cache: "no-store",
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      redirect("/inbox");
    }

    if (response.status === 403) {
      redirect(`/invite/${encodeURIComponent(token)}?error=mismatch`);
    }
    if (response.status === 409) {
      redirect(`/invite/${encodeURIComponent(token)}?error=accepted`);
    }
    if (response.status === 410) {
      redirect(`/invite/${encodeURIComponent(token)}?error=expired`);
    }

    redirect(`/invite/${encodeURIComponent(token)}?error=unavailable`);
  } catch {
    redirect(`/invite/${encodeURIComponent(token)}?error=unavailable`);
  }
}

export default async function InvitePage({ params, searchParams }: InvitePageProps) {
  const { token: rawToken } = await params;
  const actionError = (await searchParams)?.error;
  const token = typeof rawToken === "string" ? rawToken.trim() : "";
  const invitePath = token ? `/invite/${encodeURIComponent(token)}` : "/invite";
  const loginHref = `/portal/login?next=${encodeURIComponent(invitePath)}`;
  const signupHref = `/portal/signup?next=${encodeURIComponent(invitePath)}`;

  const now = INVITE_EXPIRY_NOW;

  let state: InviteState = "invalid";
  let businessName: string | null = null;
  let invitedEmail: string | null = null;

  if (token && token.length <= 256) {
    try {
      const supabase = createServiceRoleClient();
      const { data: invite, error } = await supabase
        .from("team_invites")
        .select("email,status,expires_at,business:businesses(name,is_active)")
        .eq("token", token)
        .maybeSingle();

      if (!error && invite) {
        const businessValue = (invite as { business?: BusinessSummary | BusinessSummary[] | null }).business;
        const business = Array.isArray(businessValue) ? businessValue[0] : businessValue;
        businessName = typeof business?.name === "string" ? business.name : null;
        invitedEmail = typeof invite.email === "string" ? maskEmail(invite.email) : null;

        if (invite.status === "accepted") {
          state = "accepted";
        } else if (invite.status === "revoked") {
          state = "revoked";
        } else if (
          invite.status === "expired" ||
          !invite.expires_at ||
          Number.isNaN(Date.parse(invite.expires_at)) ||
          Date.parse(invite.expires_at) <= now
        ) {
          state = "expired";
        } else if (invite.status !== "pending" || !business || business.is_active !== true) {
          state = business && business.is_active !== true ? "inactive" : "invalid";
        } else {
          const authClient = await createClient();
          const { data: authData } = await authClient.auth.getUser();
          const currentEmail = authData.user?.email?.trim().toLowerCase();
          const inviteEmail = invite.email.trim().toLowerCase();

          if (currentEmail && currentEmail !== inviteEmail) {
            state = "mismatch";
          } else if (currentEmail) {
            state = "ready";
          } else {
            state = "unauthenticated";
          }
        }
      }
    } catch {
      state = "invalid";
    }
  }

  const displayActionError = actionError && state === "ready" ? actionError : null;
  const isActionable = state === "ready";
  const title =
    state === "ready" || state === "unauthenticated"
      ? "You’re invited to join"
      : state === "expired"
        ? "This invite has expired"
        : state === "revoked"
          ? "This invite is no longer available"
          : state === "accepted"
            ? "Invite already accepted"
            : state === "inactive"
              ? "Business unavailable"
              : state === "mismatch"
                ? "Use the invited account"
                : "Invite link unavailable";

  const description =
    state === "ready"
      ? `Accept your invitation to join ${businessName ?? "this business"}.`
      : state === "unauthenticated"
        ? `Sign in or create an account with ${invitedEmail ?? "the invited email address"} to continue.`
        : state === "expired"
          ? "Ask the business owner to send you a new invitation."
          : state === "revoked"
            ? "Ask the business owner to send you a new invitation."
            : state === "accepted"
              ? "This invitation has already been used."
              : state === "inactive"
                ? "This business is not currently accepting team members."
                : state === "mismatch"
                  ? `This invitation was sent to ${invitedEmail ?? "a different email address"}.`
                  : "The invitation may be invalid or no longer available.";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-12 text-slate-900">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(125,211,252,0.35),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(165,243,252,0.4),_transparent_42%)]" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="text-2xl font-semibold tracking-tight text-slate-900">
            Mira <span className="font-normal text-accent">for Business</span>
          </Link>
          <p className="mt-3 text-sm text-slate-600">Team invitation</p>
        </div>

        <section className="rounded-[2rem] border border-white/80 bg-white/90 p-7 shadow-2xl shadow-sky-200/50 backdrop-blur sm:p-9">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-3 leading-6 text-slate-600">{description}</p>

          {businessName && (state === "ready" || state === "unauthenticated" || state === "mismatch") && (
            <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Business</p>
              <p className="mt-1 font-medium text-slate-900">{businessName}</p>
              {invitedEmail && <p className="mt-1 text-sm text-slate-600">Invited email: {invitedEmail}</p>}
            </div>
          )}

          {displayActionError && (
            <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {displayActionError}
            </p>
          )}

          {state === "mismatch" && (
            <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
              {actionError ?? "Sign out and sign in with the invited email address before accepting this invitation."}
            </p>
          )}

          {isActionable && (
            <form action={acceptInvite} className="mt-7">
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-200/70 transition hover:bg-accent-dark focus:outline-none focus:ring-4 focus:ring-cyan-100"
              >
                Accept invitation
              </button>
            </form>
          )}

          {state === "unauthenticated" && (
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <Link
                href={loginHref}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-accent hover:text-accent"
              >
                Sign in
              </Link>
              <Link
                href={signupHref}
                className="rounded-2xl bg-accent px-4 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-cyan-200/70 transition hover:bg-accent-dark"
              >
                Create account
              </Link>
            </div>
          )}

          {!isActionable && state !== "unauthenticated" && state !== "mismatch" && (
            <Link
              href="/"
              className="mt-7 inline-flex text-sm font-semibold text-accent transition hover:underline"
            >
              Return home
            </Link>
          )}
        </section>
      </div>
    </main>
  );
}
