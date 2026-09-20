import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { SettingsForm } from "./SettingsForm";
import { EmbedSnippet } from "./EmbedSnippet";
import { OwnersPanel } from "./OwnersPanel";
import { SubscriptionPanel } from "./SubscriptionPanel";
import { DeleteBusinessPanel } from "./DeleteBusinessPanel";

type TeamMember = {
  id: string;
  userId: string;
  email: string;
  role: string;
  joinedAt: string;
};

type TeamInvite = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
};

async function removeStaffMember(formData: FormData) {
  "use server";

  const businessId = String(formData.get("businessId") ?? "").trim();
  const memberId = String(formData.get("memberId") ?? "").trim();
  if (!businessId || !memberId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: owner } = await supabase
    .from("business_owners")
    .select("id")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();
  if (!owner) return;

  const serviceRole = createServiceRoleClient();
  await serviceRole
    .from("business_owners")
    .delete()
    .eq("id", memberId)
    .eq("business_id", businessId)
    .eq("role", "staff");

  revalidatePath(`/admin/businesses/${businessId}/settings`);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function inviteStatus(status: string, expiresAt: string) {
  if (status === "pending" && new Date(expiresAt).getTime() <= Date.now()) {
    return "expired";
  }
  return status;
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Settings is shared with staff, but Team management is deliberately owner-only.
  // Keep this check in the server-rendered page in addition to the API guards.
  if (!user) notFound();
  const { data: currentMembership } = await supabase
    .from("business_owners")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (currentMembership?.role !== "owner") notFound();

  const [{ data: business }, { data: ownerRows }, { data: subscription }] =
    await Promise.all([
      supabase
        .from("businesses")
        .select("*")
        .eq("id", businessId)
        .maybeSingle(),
      supabase
        .from("business_owners")
        .select("id, user_id, role, created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: true }),
      supabase
        .from("business_subscriptions")
        .select("*")
        .eq("business_id", businessId)
        .maybeSingle(),
    ]);

  if (!business) notFound();

  const serviceRole = createServiceRoleClient();
  const members: TeamMember[] = await Promise.all(
    (ownerRows ?? []).map(async (row) => {
      const { data } = await serviceRole.auth.admin.getUserById(row.user_id);
      return {
        id: row.id,
        userId: row.user_id,
        email: data.user?.email ?? row.user_id,
        role: row.role,
        joinedAt: row.created_at,
      };
    }),
  );
  const { data: inviteRows } = await serviceRole
    .from("team_invites")
    .select("id, email, role, status, expires_at, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  const invites: TeamInvite[] = (inviteRows ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    status: inviteStatus(row.status, row.expires_at),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
  const staffCount = members.filter((member) => member.role === "staff").length;
  const pendingInviteCount = invites.filter(
    (invite) =>
      invite.status === "pending" &&
      new Date(invite.expiresAt).getTime() > Date.now(),
  ).length;
  const teamBusinessId = JSON.stringify(businessId);
  const initialInvites = JSON.stringify(invites);
  const initialStaffCount = JSON.stringify(staffCount);

  const teamScript = `
(() => {
  const businessId = ${teamBusinessId};
  const initialStaffCount = ${initialStaffCount};
  const initialInvites = ${initialInvites};
  const root = document.getElementById('team-management');
  if (!root) return;

  const inviteForm = document.getElementById('team-invite-form');
  const emailInput = document.getElementById('team-invite-email');
  const message = document.getElementById('team-message');
  const capacity = document.getElementById('team-capacity');
  const list = document.getElementById('team-invites-list');
  let invites = Array.isArray(initialInvites) ? initialInvites : [];

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
  const formatDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
  };
  const normalizedStatus = (invite) => invite.status === 'pending' && new Date(invite.expiresAt).getTime() <= Date.now() ? 'expired' : invite.status;
  const statusClass = (status) => status === 'pending' ? 'bg-amber-50 text-amber-700' : status === 'accepted' ? 'bg-emerald-50 text-emerald-700' : status === 'expired' ? 'bg-slate-100 text-slate-600' : 'bg-rose-50 text-rose-700';

  const setMessage = (text, error) => {
    if (!message) return;
    message.textContent = text || '';
    message.className = text ? ('mt-2 text-sm ' + (error ? 'text-rose-600' : 'text-emerald-600')) : 'mt-2 text-sm';
  };
  const updateCapacity = () => {
    const pending = invites.filter((invite) => normalizedStatus(invite) === 'pending' && new Date(invite.expiresAt).getTime() > Date.now()).length;
    if (capacity) capacity.textContent = String(initialStaffCount + pending) + ' of 5';
  };
  const renderInvites = () => {
    if (!list) return;
    if (!invites.length) {
      list.innerHTML = '<p class="px-4 py-5 text-sm text-slate-500">No invitations yet.</p>';
      updateCapacity();
      return;
    }
    list.innerHTML = invites.map((invite) => {
      const status = normalizedStatus(invite);
      const action = status === 'pending' || status === 'expired'
        ? '<button type="button" data-invite-action="resend" data-invite-id="' + escapeHtml(invite.id) + '" data-invite-email="' + escapeHtml(invite.email) + '" class="text-xs font-medium text-accent hover:text-accent-dark">Resend</button>'
        : '';
      const revoke = status === 'pending'
        ? '<button type="button" data-invite-action="revoke" data-invite-id="' + escapeHtml(invite.id) + '" class="text-xs font-medium text-rose-600 hover:text-rose-700">Revoke</button>'
        : '';
      return '<li class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">' +
        '<div class="min-w-0"><p class="truncate text-sm font-medium text-slate-800">' + escapeHtml(invite.email) + '</p>' +
        '<p class="text-xs text-slate-500">Expires ' + formatDate(invite.expiresAt) + '</p></div>' +
        '<div class="flex items-center gap-3"><span class="rounded-full px-2 py-1 text-xs font-medium ' + statusClass(status) + '">' + escapeHtml(status) + '</span>' + action + revoke + '</div></li>';
    }).join('');
    updateCapacity();
  };
  const request = async (url, options) => {
    const response = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options || {}));
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Something went wrong.');
    return body;
  };
  const loadInvites = async () => {
    try {
      const body = await request('/api/team/invites?businessId=' + encodeURIComponent(businessId));
      invites = body.invites || [];
      renderInvites();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load invitations.', true);
    }
  };

  inviteForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailInput?.value.trim().toLowerCase();
    if (!email) return;
    const submit = inviteForm.querySelector('button[type="submit"]');
    if (submit) { submit.disabled = true; submit.textContent = 'Sending…'; }
    setMessage('');
    try {
      const body = await request('/api/team/invites', { method: 'POST', body: JSON.stringify({ businessId, email }) });
      const invite = body.invite;
      if (invite) {
        invites = [invite, ...invites.filter((item) => item.id !== invite.id)];
        renderInvites();
      }
      if (emailInput) emailInput.value = '';
      setMessage(body.emailSent === false ? 'Invitation saved, but the email could not be delivered.' : 'Invitation sent.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to send invitation.', true);
    } finally {
      if (submit) { submit.disabled = false; submit.textContent = 'Invite'; }
    }
  });

  root.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-invite-action]');
    if (!button) return;
    const action = button.dataset.inviteAction;
    const id = button.dataset.inviteId;
    if (!id) return;
    button.disabled = true;
    setMessage('');
    try {
      if (action === 'revoke') {
        await request('/api/team/invites/' + encodeURIComponent(id), { method: 'DELETE', headers: {} });
        invites = invites.map((invite) => invite.id === id ? Object.assign({}, invite, { status: 'revoked' }) : invite);
        setMessage('Invitation revoked.');
      } else {
        const email = button.dataset.inviteEmail || '';
        const body = await request('/api/team/invites', { method: 'POST', body: JSON.stringify({ businessId, email }) });
        const invite = body.invite;
        if (invite) invites = [invite, ...invites.filter((item) => item.id !== id && item.id !== invite.id)];
        setMessage(body.emailSent === false ? 'Invitation updated, but the email could not be delivered.' : 'Invitation resent.');
      }
      renderInvites();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update invitation.', true);
      button.disabled = false;
    }
  });

  renderInvites();
  loadInvites();
})();`;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="mb-6 mt-2 text-xl font-semibold">Settings</h1>
        <SettingsForm business={business} />
      </div>

      <section id="team-management" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Settings · Team</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Team management</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">Invite staff to help manage this business. Only the business owner can view or change this page.</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Staff capacity</p>
            <p id="team-capacity" className="mt-1 text-lg font-semibold text-slate-900">{staffCount + pendingInviteCount} of 5</p>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-800">Invite a staff member</h3>
          <form id="team-invite-form" className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label htmlFor="team-invite-email" className="sr-only">Staff email address</label>
            <input id="team-invite-email" type="email" required maxLength={320} placeholder="staff@business.com" className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
            <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50">Invite</button>
          </form>
          <p id="team-message" aria-live="polite" className="mt-2 text-sm" />
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Invitations</h3>
            <span className="text-xs text-slate-500">Status · expiry</span>
          </div>
          <ul id="team-invites-list" className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {invites.length ? invites.map((invite) => (
              <li key={invite.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{invite.email}</p><p className="text-xs text-slate-500">Expires {formatDate(invite.expiresAt)}</p></div>
                <span className="w-fit rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{invite.status}</span>
              </li>
            )) : <li className="px-4 py-5 text-sm text-slate-500">No invitations yet.</li>}
          </ul>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Members</h3>
            <span className="text-xs text-slate-500">Role · joined</span>
          </div>
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {members.map((member) => (
              <li key={member.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{member.email}</p><p className="text-xs text-slate-500">{member.role} · joined {formatDate(member.joinedAt)}</p></div>
                {member.role === "staff" ? (
                  <form action={removeStaffMember}>
                    <input type="hidden" name="businessId" value={businessId} />
                    <input type="hidden" name="memberId" value={member.id} />
                    <button type="submit" className="text-xs font-medium text-rose-600 hover:text-rose-700">Remove</button>
                  </form>
                ) : <span className="text-xs font-medium text-slate-500">Owner</span>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <OwnersPanel businessId={businessId} owners={[]} />
      <EmbedSnippet slug={business.slug} businessName={business.name} />
      <SubscriptionPanel businessId={businessId} subscription={subscription} />
      <DeleteBusinessPanel businessId={businessId} businessName={business.name} />
      <script dangerouslySetInnerHTML={{ __html: teamScript }} />
    </div>
  );
}
