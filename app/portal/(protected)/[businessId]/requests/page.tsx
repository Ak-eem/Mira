import { RequestForm } from "./RequestForm";

export default async function CustomRequestPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">Custom request</h2>
      <p className="mb-5 mt-1 max-w-xl text-sm text-slate-500">
        Need something built or changed for your business? Tell us what you need and we will get back to you by email.
      </p>
      <RequestForm businessId={businessId} />
    </div>
  );
}
