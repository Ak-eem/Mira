import { redirect } from "next/navigation";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { getCurrentDraft, getActiveRelease, getPublishedHistory } from "@/lib/promptReleases";
import { getAgentSettings } from "@/lib/agentSettings";
import { PromptEditor } from "./PromptEditor";
import { AgentSettingsPanel } from "./AgentSettingsPanel";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ businessId: string }> | { businessId: string };
};

export default async function PortalSettingsPage({ params }: PageProps) {
  const { businessId } = await Promise.resolve(params);

  const owner = await getCurrentBusinessOwner();
  const membership = owner?.businesses.find((b) => b.id === businessId);
  if (!owner || !membership) redirect("/portal/login");

  const [draft, active, history, agentSettings] = await Promise.all([
    getCurrentDraft(businessId),
    getActiveRelease(businessId),
    getPublishedHistory(businessId),
    getAgentSettings(businessId),
  ]);

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h1 className="mb-1 mt-2 text-xl font-semibold">Settings</h1>
        <p className="text-sm text-slate-500">
          Every published version is kept and diffable. Publishing here is the only thing that
          changes what Mira actually says to your customers.
        </p>
      </div>

      <AgentSettingsPanel
        businessId={businessId}
        initialEnabled={agentSettings.enabled}
        initialProvider={agentSettings.provider}
        canEdit={membership.role === "owner"}
      />

      <PromptEditor
        businessId={businessId}
        initialDraft={draft}
        active={active}
        history={history}
        canPublish={membership.role === "owner"}
      />
    </div>
  );
}
