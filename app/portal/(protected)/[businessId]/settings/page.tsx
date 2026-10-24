import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { createClient } from "@/lib/supabase/server";
import { EmailForwardingGuide } from "@/components/EmailForwardingGuide";
import { getCurrentDraft, getActiveRelease, getPublishedHistory } from "@/lib/promptReleases";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedLinks } from "@/components/ui/Segmented";
import { PromptEditor } from "./PromptEditor";
import { OrderTakingPanel } from "./OrderTakingPanel";
import { CourierPanel } from "./CourierPanel";
import { BrandColorPanel } from "./BrandColorPanel";
import { getBrandColor } from "@/lib/brandSettings";
import { GroundingPanel } from "./GroundingPanel";
import { getGroundingSettings } from "@/lib/grounding/settings";
import { CancelSubscriptionPanel } from "./CancelSubscriptionPanel";
import { getOrderTakingEnabled } from "@/lib/orderSettings";
import { WebsiteImport } from "../WebsiteImport";
import { EmbedSnippet } from "../EmbedSnippet";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ businessId: string }> | { businessId: string };
  searchParams?: Promise<{ tab?: string }>;
};

export default async function PortalSettingsPage({ params, searchParams }: PageProps) {
  const { businessId } = await Promise.resolve(params);
  const requestedTab = (await searchParams)?.tab;

  const owner = await getCurrentBusinessOwner();
  const membership = owner?.businesses.find((b) => b.id === businessId);
  if (!owner || !membership) redirect("/portal/login");

  const supabase = await createClient();
  const [draft, active, history, orderTakingEnabled, { data: emailBusiness }, groundingSettings, brandColor, courier] = await Promise.all([
    getCurrentDraft(businessId),
    getActiveRelease(businessId),
    getPublishedHistory(businessId),
    getOrderTakingEnabled(businessId),
    supabase.from("businesses").select("email_inbound_address, slug").eq("id", businessId).maybeSingle(),
    getGroundingSettings(supabase, businessId),
    getBrandColor(businessId),
    // Non-secret columns only; the encrypted webhook secret is never read into a page.
    supabase
      .from("business_logistics_accounts")
      .select("id")
      .eq("business_id", businessId)
      .eq("provider", "shiip")
      .eq("status", "active")
      .maybeSingle(),
  ]);
  // If this read fails (e.g. the migration isn't applied yet) the panel is
  // hidden rather than offering a connection that can't be saved.
  const courierAvailable = !courier.error;
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const courierWebhookUrl = `${protocol}://${host}/api/webhooks/shiip/${businessId}`;
  const businessName = membership.name ?? "your business";
  const inboundAddress: string | null = emailBusiness?.email_inbound_address ?? null;

  const isOwner = membership.role === "owner";
  const base = `/portal/${businessId}/settings`;
  const tabs = [
    { key: "info", label: "Business info", href: `${base}?tab=info` },
    { key: "widget", label: "Website chat", href: `${base}?tab=widget` },
    { key: "behaviour", label: "How Mira behaves", href: `${base}?tab=behaviour` },
    ...(isOwner ? [{ key: "plan", label: "Plan", href: `${base}?tab=plan` }] : []),
  ];
  const tab = tabs.some((t) => t.key === requestedTab) ? (requestedTab as string) : "info";

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" subtitle="Everything that changes what Mira says and how it behaves. Publishing a new version is the only thing that changes what customers see." />

      <div className="mb-6 overflow-x-auto pb-1">
        <SegmentedLinks label="Settings sections" current={tab} options={tabs} />
      </div>

      <div className="ui-enter space-y-6" key={tab}>
        {tab === "info" && (
          <>
            <div id="import-website" className="scroll-mt-24">
              <WebsiteImport businessId={businessId} />
            </div>
            {inboundAddress && (
              <section className="ui-card space-y-1">
                <p className="ui-section-label ml-0">Email</p>
                <h2 className="text-lg font-semibold tracking-tight">Let Mira answer your customer emails</h2>
                <p className="ui-subtitle mt-0">Forward your support email to the address below and Mira will reply on your behalf.</p>
                <EmailForwardingGuide inboundAddress={inboundAddress} />
              </section>
            )}
          </>
        )}

        {tab === "widget" && (
          <>
            {emailBusiness?.slug && (
              <div id="add-widget" className="scroll-mt-24">
                <EmbedSnippet slug={emailBusiness.slug} businessName={businessName} />
              </div>
            )}
            <BrandColorPanel businessId={businessId} businessName={businessName} initialColor={brandColor} canEdit={isOwner} />
          </>
        )}

        {tab === "behaviour" && (
          <>
            <OrderTakingPanel businessId={businessId} initialEnabled={orderTakingEnabled} canEdit={isOwner} />
            {courierAvailable && <CourierPanel businessId={businessId} connected={Boolean(courier.data)} webhookUrl={courierWebhookUrl} canEdit={isOwner} />}
            <GroundingPanel businessId={businessId} initialLevel={groundingSettings.reviewLevel} initialEscalate={groundingSettings.escalateRepeat} canEdit={isOwner} />
            <PromptEditor businessId={businessId} initialDraft={draft} active={active} history={history} canPublish={isOwner} />
          </>
        )}

        {/* Owners only. Staff never see the cancel option. */}
        {tab === "plan" && isOwner && <CancelSubscriptionPanel businessId={businessId} businessName={businessName} />}
      </div>
    </div>
  );
}
