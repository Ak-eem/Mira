import { redirect } from "next/navigation";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { SetupWizard } from "./SetupWizard";

export default async function SetupPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const owner = await getCurrentBusinessOwner();
  const membership = owner?.businesses.find((b) => b.id === businessId);

  if (!membership) redirect("/portal");
  // Setup answers are the owner's to give (the database enforces the same
  // rule); staff just land on the dashboard.
  if (membership.role !== "owner") redirect(`/portal/${businessId}`);

  return <SetupWizard businessId={businessId} businessName={membership.name ?? "your business"} />;
}
