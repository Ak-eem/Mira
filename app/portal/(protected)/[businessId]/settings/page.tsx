import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { createClient } from "@/lib/supabase/server";
import { EmailForwardingGuide } from "@/components/EmailForwardingGuide";
import { getCurrentDraft, getActiveRelease, getPublishedHistory } from "@/lib/promptReleases";
import { PromptEditor } from "./PromptEditor";
import { OrderTakingPanel } from "./OrderTakingPanel";
import { CourierPanel } from "./CourierPanel";
import { BrandColorPanel } from "./BrandColorPanel";
import { getBrandColor } from "@/lib/brandSettings";
import { GroundingPanel } from "./GroundingPanel";
import { getGroundingSettings } from "@/lib/grounding/settings";
import { CancelSubscriptionPanel } from "./CancelSubscriptionPanel";
import { AccountDeletionPanel } from "./AccountDeletionPanel";
import { DELETE_REQUEST_SUMMARY } from "@/lib/deletionRequest";
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
  const { data: deletionRequest } = await supabase
    .from("activity_log")
    .select("created_at")
    .eq("business_id", businessId)
    .eq("entity_type", "business")
    .like("summary", `${DELETE_REQUEST_SUMMARY}%`)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const deletionRequestedOn = deletionRequest?.created_at
    ? new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" }).format(new Date(deletionRequest.created_at))
    : null;
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const courierWebhookUrl = `${protocol}://${host}/api/webhooks/shiip/${businessId}`;
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

      <OrderTakingPanel
        businessId={businessId}
        initialEnabled={orderTakingEnabled}
        canEdit={membership.role === "owner"}
      />

      {courierAvailable && (
        <CourierPanel
          businessId={businessId}
          connected={Boolean(courier.data)}
          webhookUrl={courierWebhookUrl}
          canEdit={membership.role === "owner"}
        />
      )}

      <BrandColorPanel
        businessId={businessId}
        businessName={businessName}
        initialColor={brandColor}
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
      {membership.role === "owner" && <AccountDeletionPanel businessId={businessId} businessName={businessName} requestedOn={deletionRequestedOn} />}
    </div>
  );
}
