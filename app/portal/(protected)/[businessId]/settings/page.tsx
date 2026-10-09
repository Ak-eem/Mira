import { redirect } from "next/navigation";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { createClient } from "@/lib/supabase/server";
import { EmailForwardingGuide } from "@/components/EmailForwardingGuide";
import { getCurrentDraft, getActiveRelease, getPublishedHistory } from "@/lib/promptReleases";
import { getAgentSettings } from "@/lib/agentSettings";
import { PromptEditor } from "./PromptEditor";
import { AgentSettingsPanel } from "./AgentSettingsPanel";
import { OrderTakingPanel } from "./OrderTakingPanel";
import { GroundingPanel } from "./GroundingPanel";
import { getGroundingSettings } from "@/lib/grounding/settings";
import { CancelSubscriptionPanel } from "./CancelSubscriptionPanel";
import { getOrderTakingEnabled } from "@/lib/orderSettings";
import { WebsiteImport } from "../WebsiteImport";
import { EmbedSnippet } from "../EmbedSnippet";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ businessId: string }> | { businessId: string };
};

export default async function PortalSettingsPage({ params }: PageProps) {
  const { businessId } = await Promise.resolve(params);

  const owner = await getCurrentBusinessOwner();
  const membership = owner?.businesses.find((b) => b.id === businessId);
  if (!owner || !membership) redirect("/portal/login");

  const supabase = await createClient();
  const [draft, active, history, agentSettings, orderTakingEnabled, { data: emailBusiness }, groundingSettings] = await Promise.all([
    getCurrentDraft(businessId),
    getActiveRelease(businessId),
    getPublishedHistory(businessId),
    getAgentSettings(businessId),
    getOrderTakingEnabled(businessId),
    supabase.from("businesses").select("email_inbound_address, slug").eq("id", businessId).maybeSingle(),
    getGroundingSettings(supabase, businessId),
  ]);
  const businessName = membership.name ?? "your business";
  const inboundAddress: string | null = emailBusiness?.email_inbound_address ?? null;

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="mb-1 mt-2 text-xl font-semibold">Settings</h1>
        <p className="text-sm text-slate-500">
          Every published version is kept and diffable. Publishing here is the only thing that
          changes what Mira actually says to your customers.
        </p>
      </div>

      <div id="import-website" className="scroll-mt-24">
        <WebsiteImport businessId={businessId} />
      </div>

      {emailBusiness?.slug && (
        <div id="add-widget" className="scroll-mt-24">
          <EmbedSnippet slug={emailBusiness.slug} businessName={businessName} />
        </div>
      )}

      <AgentSettingsPanel
        businessId={businessId}
        initialEnabled={agentSettings.enabled}
        initialProvider={agentSettings.provider}
        canEdit={membership.role === "owner"}
      />

      <OrderTakingPanel
        businessId={businessId}
        initialEnabled={orderTakingEnabled}
        canEdit={membership.role === "owner"}
      />

      <GroundingPanel
        businessId={businessId}
        initialLevel={groundingSettings.reviewLevel}
        initialEscalate={groundingSettings.escalateRepeat}
        canEdit={membership.role === "owner"}
      />

      {inboundAddress && (
        <section className="space-y-1 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Email</p>
          <h2 className="text-lg font-semibold">Let Mira answer your customer emails</h2>
          <p className="text-sm text-slate-500">
            Forward your support email to the address below and Mira will reply on your behalf.
          </p>
          <EmailForwardingGuide inboundAddress={inboundAddress} />
        </section>
      )}

      <PromptEditor
        businessId={businessId}
        initialDraft={draft}
        active={active}
        history={history}
        canPublish={membership.role === "owner"}
      />

      {/* Owners only. Staff never see the cancel option. */}
      {membership.role === "owner" && <CancelSubscriptionPanel businessId={businessId} businessName={businessName} />}
    </div>
  );
}
