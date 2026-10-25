import { PageHeader } from "@/components/ui/PageHeader";
import { RequestForm } from "./RequestForm";

export default async function CustomRequestPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  return (
    <div>
      <PageHeader title="Custom request" subtitle="Need something built or changed for your business? Tell us what you need and we will get back to you by email." />
      <RequestForm businessId={businessId} />
    </div>
  );
}
