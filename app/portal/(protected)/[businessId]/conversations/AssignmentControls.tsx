"use client";

import { useState } from "react";

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
  const [optimisticAssignedTo, setOptimisticAssignedTo] = useState<{
    base: string | null;
    value: string | null;
  } | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const displayedAssignedTo =
    optimisticAssignedTo && assignedTo === optimisticAssignedTo.base
      ? optimisticAssignedTo.value
      : assignedTo;
  const isAssignedToMe = displayedAssignedTo === currentUserId;
  const canUnclaim = isAssignedToMe || isOwner;
  const endpoint = `/api/conversations/${conversationId}/claim`;

  async function updateAssignment() {
    const method = displayedAssignedTo ? "DELETE" : "POST";
    const nextAssignedTo = method === "POST" ? currentUserId : null;

    setIsPending(true);
    setErrorMessage(null);
    setOptimisticAssignedTo({ base: assignedTo, value: nextAssignedTo });

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { Accept: "application/json" },
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setOptimisticAssignedTo(null);
        if (response.status === 409) {
          setErrorMessage("claimed by someone else");
        } else {
          setErrorMessage(
            getErrorMessage(body) ?? "Unable to update assignment. Please try again.",
          );
        }
        return;
      }

      onAssignmentChange?.(nextAssignedTo);
    } catch {
      setOptimisticAssignedTo(null);
      setErrorMessage("Unable to update assignment. Please check your connection and try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={
          displayedAssignedTo
            ? "rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700"
            : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
        }
        aria-label={
          displayedAssignedTo ? `Assigned to ${displayedAssignedTo}` : "Unassigned"
        }
      >
        {displayedAssignedTo
          ? isAssignedToMe
            ? "Assigned to you"
            : `Assigned to ${displayedAssignedTo}`
          : "Unassigned"}
      </span>

      {(!displayedAssignedTo || canUnclaim) && (
        <button
          type="button"
          onClick={updateAssignment}
          disabled={isPending}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Updating…" : displayedAssignedTo ? "Unclaim" : "Claim"}
        </button>
      )}

      {displayedAssignedTo && !canUnclaim && (
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
