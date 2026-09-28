import { redirect } from "next/navigation";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { getAgentSettings } from "@/lib/agentSettings";
import { CommandCenter } from "./CommandCenter";

type PageProps = {
  params: Promise<{ businessId: string }> | { businessId: string };
};

export default async function InventoryAssistantPage({ params }: PageProps) {
  const { businessId } = await Promise.resolve(params);

  const owner = await getCurrentBusinessOwner();
  const membership = owner?.businesses.find((b) => b.id === businessId);
  if (!owner || !membership) redirect("/portal/login");

  const agentSettings = await getAgentSettings(businessId);

  return (
    <div>
      <h1 className="mb-1 mt-2 text-xl font-semibold">Inventory assistant</h1>
      <p className="mb-6 text-sm text-slate-500">
        Tell Mira what changed in stock, price, or availability. Nothing writes to your data
        without you confirming it first.
      </p>
      {!agentSettings.enabled ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          The inventory assistant is turned off. {membership.role === "owner" ? (
            <a href={`/portal/${businessId}/settings`} className="text-accent hover:underline">
              Turn it on in Settings
            </a>
          ) : (
            "Ask the business owner to turn it on in Settings."
          )}
        </p>
      ) : membership.role === "owner" ? (
        <CommandCenter businessId={businessId} />
      ) : (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Only the business owner can use the inventory assistant.
        </p>
      )}
    </div>
  );
}
