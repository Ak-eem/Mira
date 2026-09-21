import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { SettingsForm } from "./SettingsForm";
import { EmbedSnippet } from "./EmbedSnippet";
import { OwnersPanel } from "./OwnersPanel";
import { SubscriptionPanel } from "./SubscriptionPanel";
import { DeleteBusinessPanel } from "./DeleteBusinessPanel";
import { TeamInviteForm } from "./TeamInviteForm";

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
  if (Array.isArray(record.data)) return record.data as unknown[];
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

export default async function SettingsPage({ params }: PageProps) {
  const { businessId } = await Promise.resolve(params);
  const supabase = await createClient();

  const [
    { data: business },
    { data: ownerRows },
    { data: subscription },
  ] = await Promise.all([
    supabase.from("businesses").select("*").eq("id", businessId).maybeSingle(),
    supabase
      .from("business_owners")
      .select("id, user_id")
      .eq("business_id", businessId),
    supabase
      .from("business_subscriptions")
      .select("*")
      .eq("business_id", businessId)
      .maybeSingle(),
  ]);

  if (!business) notFound();

  const serviceRole = createServiceRoleClient();
  const owners = await Promise.all(
    (ownerRows ?? []).map(async (row) => {
      const { data } = await serviceRole.auth.admin.getUserById(row.user_id);
      return { id: row.id, email: data.user?.email ?? row.user_id };
    }),
  );

  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie") ?? "";
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${protocol}://${host}` : null;
  const query = `businessId=${encodeURIComponent(businessId)}`;
  const [invitationPayload, memberPayload] = baseUrl
    ? await Promise.all([
        getJson(`${baseUrl}/api/team/invites?${query}`, cookie),
        getJson(`${baseUrl}/api/team/members?${query}`, cookie),
      ])
    : [null, null];

  const invitations = asArray(invitationPayload, ["invitations", "invites"]).map(normaliseInvitation);
  const members = asArray(memberPayload, ["members", "teamMembers"]).map(normaliseMember);
  const pendingInvitations = invitations.filter((invitation) =>
    ["pending", "sent", "open"].includes(invitation.status.toLowerCase()),
  );
  const usedCapacity = members.length + pendingInvitations.length;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="mb-6 mt-2 text-xl font-semibold">Settings</h1>
        <SettingsForm business={business} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Additional section</p>
        <h2 className="mt-1 text-lg font-semibold">AI prompt</h2>
        <p className="mt-1 text-sm text-slate-500">
          Tone and instructions now live in their own versioned editor — draft, diff against what&apos;s
          live, publish, and roll back if needed.
        </p>
        <a
          href={`/admin/businesses/${businessId}/settings/prompt`}
          className="mt-3 inline-block rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
        >
          Open prompt editor
        </a>
      </section>

      <OwnersPanel businessId={businessId} owners={owners} />
      <EmbedSnippet slug={business.slug} businessName={business.name} />
      <SubscriptionPanel businessId={businessId} subscription={subscription} />
      <DeleteBusinessPanel businessId={businessId} businessName={business.name} />

      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Additional section</p>
          <h2 className="mt-1 text-lg font-semibold">Team access</h2>
          <p className="mt-1 text-sm text-slate-500">Invite teammates and manage access without replacing the rest of business settings.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Team capacity</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{usedCapacity}/5</p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">Invite a teammate</h3>
          <p className="mt-1 text-sm text-slate-500">They will receive an invitation to join this business.</p>
          <TeamInviteForm businessId={businessId} />
        </div>

        <div className="rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Invitations</h3>
          </div>
          {invitations.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">No invitations yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {invitations.map((invitation) => (
                <div key={invitation.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
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
        </div>

        <div className="rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Members</h3>
          </div>
          {members.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">No members found.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {members.map((member) => (
                <div key={member.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
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
        </div>
      </section>

      <script
        dangerouslySetInnerHTML={{
          __html: `document.querySelectorAll('form[data-team-action]').forEach(function(form){form.addEventListener('submit',function(event){event.preventDefault();var button=form.querySelector('button[type=submit]');if(button){button.disabled=true;}var body={};new FormData(form).forEach(function(value,key){body[key]=value;});fetch(form.action,{method:form.dataset.method||'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(response){if(!response.ok){throw new Error('Request failed');}window.location.reload();}).catch(function(){if(button){button.disabled=false;}window.alert('The request could not be completed. Please try again.');});});});`,
        }}
      />
    </div>
  );
}
