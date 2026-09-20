"use client";

import { useEffect, useState } from "react";

export type AssignmentControlsProps = {
  conversationId: string;
  assignedTo: string | null;
  currentUserId: string;
  isOwner: boolean;
  onAssignmentChange?: (assignedTo: string | null) => void;
};

function getErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("error" in body)) {
    return null;
  }

  const error = (body as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : null;
}

export function AssignmentControls({
  conversationId,
  assignedTo,
  currentUserId,
  isOwner,
  onAssignmentChange,
}: AssignmentControlsProps) {
  const [currentAssignedTo, setCurrentAssignedTo] = useState(assignedTo);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setCurrentAssignedTo(assignedTo);
  }, [assignedTo]);

  const isAssignedToMe = currentAssignedTo === currentUserId;
  const canUnclaim = isAssignedToMe || isOwner;
  const endpoint = `/api/conversations/${conversationId}/claim`;

  async function updateAssignment() {
    const method = currentAssignedTo ? "DELETE" : "POST";

    setIsPending(true);
    setErrorMessage(null);

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { Accept: "application/json" },
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 409) {
          setErrorMessage("claimed by someone else");
        } else {
          setErrorMessage(
            getErrorMessage(body) ?? "Unable to update assignment. Please try again.",
          );
        }
        return;
      }

      const nextAssignedTo = method === "POST" ? currentUserId : null;
      setCurrentAssignedTo(nextAssignedTo);
      onAssignmentChange?.(nextAssignedTo);
    } catch {
      setErrorMessage("Unable to update assignment. Please check your connection and try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={
          currentAssignedTo
            ? "rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700"
            : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
        }
        aria-label={currentAssignedTo ? `Assigned to ${currentAssignedTo}` : "Unassigned"}
      >
        {currentAssignedTo
          ? isAssignedToMe
            ? "Assigned to you"
            : `Assigned to ${currentAssignedTo}`
          : "Unassigned"}
      </span>

      {(!currentAssignedTo || canUnclaim) && (
        <button
          type="button"
          onClick={updateAssignment}
          disabled={isPending}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Updating…" : currentAssignedTo ? "Unclaim" : "Claim"}
        </button>
      )}

      {currentAssignedTo && !canUnclaim && (
        <span className="text-xs text-slate-500">Claimed by another teammate</span>
      )}

      {errorMessage && (
        <p className="basis-full text-xs text-red-600" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

export default AssignmentControls;
