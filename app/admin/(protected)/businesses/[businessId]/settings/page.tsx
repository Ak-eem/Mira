import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

 type PageProps = {
  params: Promise<{ businessId: string }> | { businessId: string };
};

type JsonRecord = Record<string, unknown>;

type Invitation = {
  id: string;
  email: string;
  status: string;
  expiresAt: string | null;
};

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string | null;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function asArray(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  if (record.data && Array.isArray(record.data)) return record.data as unknown[];
  return [];
}

function stringValue(record: JsonRecord, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

function normaliseInvitation(value: unknown, index: number): Invitation {
  const record = asRecord(value);
  return {
    id: stringValue(record, ["id", "invite_id", "invitation_id"], `invitation-${index}`),
    email: stringValue(record, ["email", "invitee_email", "recipient_email"], "Unknown email"),
    status: stringValue(record, ["status", "state"], "pending"),
    expiresAt: stringValue(record, ["expires_at", "expiresAt", "expiration"], "") || null,
  };
}

function normaliseMember(value: unknown, index: number): Member {
  const record = asRecord(value);
  const profile = asRecord(record.profile);
  return {
    id: stringValue(record, ["id", "member_id", "user_id"], `member-${index}`),
    name:
      stringValue(record, ["name", "full_name", "display_name"], "") ||
      stringValue(profile, ["name", "full_name", "display_name"], "Unnamed member"),
    email:
      stringValue(record, ["email", "user_email"], "") ||
      stringValue(profile, ["email"], "No email available"),
    role: stringValue(record, ["role", "member_role"], "member"),
    joinedAt: stringValue(record, ["joined_at", "joinedAt", "created_at"], "") || null,
  };
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

async function getJson(url: string, cookie: string) {
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: cookie ? { cookie } : undefined,
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export default async function TeamSettingsPage({ params }: PageProps) {
  const { businessId } = await Promise.resolve(params);
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie") ?? "";
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";

  if (!host) redirect("/admin");

  // Load the helper dynamically so this page works with either supported server-client export.
  const serverModule = (await import("@/lib/supabase/server")) as {
    createClient?: () => Promise<any> | any;
    getSupabaseServerClient?: () => Promise<any> | any;
  };
  const createServerClient = serverModule.createClient ?? serverModule.getSupabaseServerClient;
  if (!createServerClient) redirect("/admin");

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=/admin/businesses/${encodeURIComponent(businessId)}/settings`);

  // Do not trust the route parameter alone: only an authenticated business owner may view this page.
  const { data: owner, error: ownerError } = await supabase
    .from("business_owners")
    .select("business_id")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (ownerError || !owner) redirect("/admin");

  const baseUrl = `${protocol}://${host}`;
  const query = `businessId=${encodeURIComponent(businessId)}`;
  const [invitationPayload, memberPayload] = await Promise.all([
    getJson(`${baseUrl}/api/team/invites?${query}`, cookie),
    getJson(`${baseUrl}/api/team/members?${query}`, cookie),
  ]);

  const invitations = asArray(invitationPayload, ["invitations", "invites"]).map(normaliseInvitation);
  const members = asArray(memberPayload, ["members", "teamMembers"]).map(normaliseMember);
  const pendingInvitations = invitations.filter((invitation) =>
    ["pending", "sent", "open"].includes(invitation.status.toLowerCase()),
  );
  const usedCapacity = members.length + pendingInvitations.length;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Business settings</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Team access</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Invite teammates, review pending invitations, and manage who can access this business.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Team capacity</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{usedCapacity}/5</p>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-lg font-semibold">Invite a teammate</h2>
            <p className="mt-1 text-sm text-slate-500">They will receive an invitation to join this business.</p>
          </div>
          <form action="/api/team/invites" method="post" className="flex flex-col gap-3 sm:flex-row">
            <input type="hidden" name="businessId" value={businessId} />
            <label className="sr-only" htmlFor="team-invite-email">Teammate email address</label>
            <input
              id="team-invite-email"
              name="email"
              type="email"
              required
              placeholder="teammate@example.com"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none ring-indigo-500 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2"
            />
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Send invite
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-lg font-semibold">Invitations</h2>
            <p className="mt-1 text-sm text-slate-500">Track invitations and manage their access.</p>
          </div>
          {invitations.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">No invitations yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {invitations.map((invitation) => (
                <div key={invitation.id} className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{invitation.email}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="capitalize">{invitation.status}</span>
                      <span>Expires {formatDate(invitation.expiresAt)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form data-team-action data-method="PATCH" action={`/api/team/invites/${encodeURIComponent(invitation.id)}`}>
                      <input type="hidden" name="businessId" value={businessId} />
                      <input type="hidden" name="action" value="resend" />
                      <button type="submit" className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Resend</button>
                    </form>
                    <form data-team-action data-method="PATCH" action={`/api/team/invites/${encodeURIComponent(invitation.id)}`}>
                      <input type="hidden" name="businessId" value={businessId} />
                      <input type="hidden" name="action" value="revoke" />
                      <button type="submit" className="rounded-md border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">Revoke</button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-lg font-semibold">Members</h2>
            <p className="mt-1 text-sm text-slate-500">People who currently have access to this business.</p>
          </div>
          {members.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">No members found.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {members.map((member) => (
                <div key={member.id} className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{member.name}</p>
                    <p className="truncate text-sm text-slate-500">{member.email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <div className="text-right text-xs text-slate-500">
                      <p className="font-medium capitalize text-slate-700">{member.role}</p>
                      <p>Joined {formatDate(member.joinedAt)}</p>
                    </div>
                    {member.role.toLowerCase() !== "owner" ? (
                      <form data-team-action data-method="PATCH" action={`/api/team/members/${encodeURIComponent(member.id)}`}>
                        <input type="hidden" name="businessId" value={businessId} />
                        <input type="hidden" name="action" value="remove" />
                        <button type="submit" className="rounded-md border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">Remove</button>
                      </form>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `document.querySelectorAll('form[data-team-action]').forEach(function(form){form.addEventListener('submit',function(event){event.preventDefault();var button=form.querySelector('button[type=submit]');if(button){button.disabled=true;}var body={};new FormData(form).forEach(function(value,key){body[key]=value;});fetch(form.action,{method:form.dataset.method||'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(response){if(!response.ok){throw new Error('Request failed');}window.location.reload();}).catch(function(){if(button){button.disabled=false;}window.alert('The request could not be completed. Please try again.');});});});`,
        }}
      />
    </main>
  );
}
