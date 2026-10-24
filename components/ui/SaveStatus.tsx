import type { SaveStatus as Status } from "./useAutoSave";

export function SaveStatus({ status, error }: { status: Status; error: string | null }) {
  return (
    <p className="ui-hint mt-2 min-h-5 px-4" role="status" aria-live="polite">
      {status === "saving" && "Saving…"}
      {status === "saved" && <span className="font-medium text-emerald-700">&#10003; Saved</span>}
      {status === "error" && <span className="text-red-600">{error}</span>}
    </p>
  );
}
