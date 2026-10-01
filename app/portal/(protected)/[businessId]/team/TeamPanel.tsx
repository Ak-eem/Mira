"use client";

import { useEffect, useState, type FormEvent } from "react";

type Member = { id: string; name: string; email: string; role: string; joinedAt: string };
type Invite = { id: string; email: string; role: string; status: string; expiresAt: string };

type Feedback = { kind: "success" | "error"; text: string };

function roleLabel(role: string): string {
  return role === "owner" ? "Owner" : "Staff";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

// All authorisation lives in the existing /api/team/* routes (owner-only,
// last-owner protection, invite rate limits). This panel is only a screen over
// them, so it can't grant anything those routes wouldn't.
export function TeamPanel({ businessId }: { businessId: string }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  // Bumping this re-runs the loading effect below, so every action refreshes
  // the lists the same way the first load does.
  const [refreshKey, setRefreshKey] = useState(0);
  const reload = () => setRefreshKey((key) => key + 1);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const query = `businessId=${encodeURIComponent(businessId)}`;
        const [memberRes, inviteRes] = await Promise.all([
          fetch(`/api/team/members?${query}`),
          fetch(`/api/team/invites?${query}`),
        ]);
        if (cancelled) return;

        if (!memberRes.ok) {
          const message = await readError(memberRes, "Couldn't load your team.");
          if (!cancelled) setLoadError(message);
          return;
        }
        const memberBody = (await memberRes.json()) as { members?: Member[] };
        const inviteBody = inviteRes.ok ? ((await inviteRes.json()) as { invites?: Invite[] }) : null;
        if (cancelled) return;

        setMembers(memberBody.members ?? []);
        if (inviteBody) {
          setInvites((inviteBody.invites ?? []).filter((invite) => invite.status === "pending" || invite.status === "expired"));
        }
        setLoadError(null);
      } catch {
        if (!cancelled) setLoadError("Couldn't load your team. Check your connection and refresh.");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [businessId, refreshKey]);

  async function run(id: string, request: () => Promise<Response>, success: string, failure: string) {
    setBusyId(id);
    setFeedback(null);
    try {
      const response = await request();
      if (!response.ok) {
        setFeedback({ kind: "error", text: await readError(response, failure) });
        return;
      }
      setFeedback({ kind: "success", text: success });
      reload();
    } catch {
      setFeedback({ kind: "error", text: failure });
    } finally {
      setBusyId(null);
    }
  }

  function patchMember(member: Member, body: Record<string, string>, success: string) {
    return run(
      member.id,
      () =>
        fetch(`/api/team/members/${member.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      success,
      "That change didn't go through.",
    );
  }

  function changeRole(member: Member) {
    const next = member.role === "owner" ? "staff" : "owner";
    const question =
      next === "owner"
        ? `Make ${member.email} an owner? Owners can publish prompts, change AI settings and manage the team.`
        : `Make ${member.email} staff? They'll lose owner access.`;
    if (!window.confirm(question)) return;
    void patchMember(member, { action: "role", role: next }, `${member.email} is now ${roleLabel(next).toLowerCase()}.`);
  }

  function removeMember(member: Member) {
    if (!window.confirm(`Remove ${member.email} from the team? They'll lose access immediately.`)) return;
    void patchMember(member, { action: "remove" }, `${member.email} was removed.`);
  }

  function revokeInvite(invite: Invite) {
    void run(
      invite.id,
      () => fetch(`/api/team/invites/${invite.id}`, { method: "DELETE" }),
      `Invitation to ${invite.email} cancelled.`,
      "Couldn't cancel that invitation.",
    );
  }

  async function sendInvite(inviteEmail: string): Promise<boolean> {
    const response = await fetch("/api/team/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ businessId, email: inviteEmail }),
    });
    if (!response.ok) {
      setFeedback({ kind: "error", text: await readError(response, "Couldn't send the invitation.") });
      return false;
    }
    const body = (await response.json().catch(() => null)) as { emailSent?: unknown } | null;
    setFeedback(
      body?.emailSent === false
        ? { kind: "error", text: "The invitation was created but the email couldn't be sent. Try resending in a moment." }
        : { kind: "success", text: `Invitation sent to ${inviteEmail}.` },
    );
    return true;
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviting(true);
    setFeedback(null);
    try {
      if (await sendInvite(email.trim())) {
        setEmail("");
        reload();
      }
    } catch {
      setFeedback({ kind: "error", text: "Couldn't send the invitation. Check your connection and try again." });
    } finally {
      setInviting(false);
    }
  }

  async function resendInvite(invite: Invite) {
    setBusyId(invite.id);
    setFeedback(null);
    try {
      await sendInvite(invite.email);
      reload();
    } catch {
      setFeedback({ kind: "error", text: "Couldn't resend the invitation." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">People with access</h2>

        {loadError && <p className="text-sm text-red-600">{loadError}</p>}
        {!loadError && members === null && <p className="text-sm text-slate-400">Loading…</p>}

        {members && (
          <ul className="divide-y divide-slate-100">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {member.name !== "Unnamed member" ? member.name : member.email}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {member.name !== "Unnamed member" ? `${member.email} · ` : ""}
                    {roleLabel(member.role)}
                    {formatDate(member.joinedAt) ? ` · joined ${formatDate(member.joinedAt)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <button
                    type="button"
                    disabled={busyId === member.id}
                    onClick={() => changeRole(member)}
                    className="text-slate-500 hover:text-slate-800 disabled:opacity-50"
                  >
                    {member.role === "owner" ? "Make staff" : "Make owner"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === member.id}
                    onClick={() => removeMember(member)}
                    className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {invites.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Pending invitations</h2>
          <ul className="divide-y divide-slate-100">
            {invites.map((invite) => (
              <li key={invite.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-800">{invite.email}</p>
                  <p className="text-xs text-slate-400">
                    {invite.status === "expired" ? "Expired" : `Expires ${formatDate(invite.expiresAt)}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <button
                    type="button"
                    disabled={busyId === invite.id}
                    onClick={() => void resendInvite(invite)}
                    className="text-slate-500 hover:text-slate-800 disabled:opacity-50"
                  >
                    Resend
                  </button>
                  <button
                    type="button"
                    disabled={busyId === invite.id}
                    onClick={() => revokeInvite(invite)}
                    className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Invite someone</h2>
        <p className="text-sm text-slate-500">
          They&apos;ll get an email with a link to join as staff. You can make them an owner afterwards.
        </p>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teammate@example.com"
            aria-label="Teammate email address"
            className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={inviting}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            {inviting ? "Sending…" : "Send invite"}
          </button>
        </form>
      </section>

      {feedback && (
        <p className={feedback.kind === "error" ? "text-sm text-red-600" : "text-sm text-emerald-700"} role="status">
          {feedback.text}
        </p>
      )}
    </div>
  );
}
