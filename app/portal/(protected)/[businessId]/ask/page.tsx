import { redirect } from "next/navigation";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { ASK_ALLOWED_ROLES } from "@/lib/ask/api";
import { AskPanel } from "./AskPanel";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ businessId: string }> | { businessId: string };
};

export default async function AskYourDataPage({ params }: PageProps) {
  const { businessId } = await Promise.resolve(params);

  const owner = await getCurrentBusinessOwner();
  const membership = owner?.businesses.find((b) => b.id === businessId);
  if (!owner || !membership) redirect("/portal/login");
  // Same rule as the endpoint: the endpoint is the real gate, this just avoids showing a page that can't work.
  if (!ASK_ALLOWED_ROLES.includes(membership.role)) redirect(`/portal/${businessId}`);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Ask your data"
        subtitle="Ask a question about your chats, orders or reply quality in plain English. Every answer shows the numbers and dates it came from, and if your data can't answer, it says so."
      />
      <AskPanel businessId={businessId} />
    </div>
  );
}
