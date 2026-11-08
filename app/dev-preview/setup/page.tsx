import { notFound } from "next/navigation";
import { SetupWizard } from "@/app/portal/(protected)/[businessId]/setup/SetupWizard";

export default function SetupPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <>
      <div className="mx-auto max-w-2xl px-4 pt-4">
        <p className="rounded-xl bg-amber-100 px-4 py-3 text-sm font-medium text-amber-950">
          Local visual preview only. Answers are not saved.
        </p>
      </div>
      <SetupWizard businessId="preview" businessName="unity" previewOnly />
    </>
  );
}
