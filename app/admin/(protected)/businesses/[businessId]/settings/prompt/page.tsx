import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentDraft, getActiveRelease, getPublishedHistory } from "@/lib/promptReleases";
import { PromptEditor } from "./PromptEditor";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ businessId: string }> | { businessId: string };
};

export default async function PromptReleasePage({ params }: PageProps) {
  const { businessId } = await Promise.resolve(params);
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .maybeSingle();
  if (!business) notFound();

  const [draft, active, history] = await Promise.all([
    getCurrentDraft(businessId),
    getActiveRelease(businessId),
    getPublishedHistory(businessId),
  ]);

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <Link
          href={`/admin/businesses/${businessId}/settings`}
          className="text-sm text-slate-500 hover:underline"
        >
          ← Settings
        </Link>
        <h1 className="mb-1 mt-2 text-xl font-semibold">AI prompt — {business.name}</h1>
        <p className="text-sm text-slate-500">
          Every published version is kept and diffable. Publishing here is the only thing that
          changes what Mira actually says to customers.
        </p>
      </div>

      <PromptEditor businessId={businessId} initialDraft={draft} active={active} history={history} />
    </div>
  );
}
