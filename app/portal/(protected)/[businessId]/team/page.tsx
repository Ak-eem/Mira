import { redirect } from "next/navigation";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { TeamPanel } from "./TeamPanel";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ businessId: string }> | { businessId: string };
};

export default async function PortalTeamPage({ params }: PageProps) {
  const { businessId } = await Promise.resolve(params);

  const owner = await getCurrentBusinessOwner();
  const membership = owner?.businesses.find((b) => b.id === businessId);
  if (!owner || !membership) redirect("/portal/login");

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h1 className="mb-1 mt-2 text-xl font-semibold">Team</h1>
        <p className="text-sm text-slate-500">
          Invite the people who help you run {membership.name}. Staff can work conversations and orders and
          save AI prompt drafts. Only owners can publish prompts, change AI settings and manage the team.
        </p>
      </div>

      {membership.role === "owner" ? (
        <TeamPanel businessId={businessId} />
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-xs">
          Only the business owner can manage the team.
        </p>
      )}
    </div>
  );
}
