"use client";

import { useState } from "react";

export type AssignmentControlsProps = {
  conversationId: string;
  claimedBy: string | null;
  currentUserEmail: string;
  isOwner: boolean;
  onAssignmentChange?: (claimedBy: string | null) => void;
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
  claimedBy,
  currentUserEmail,
  isOwner,
  onAssignmentChange,
}: AssignmentControlsProps) {
  const [optimisticClaimedBy, setOptimisticClaimedBy] = useState<{
    base: string | null;
    value: string | null;
  } | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const displayedClaimedBy =
    optimisticClaimedBy && claimedBy === optimisticClaimedBy.base
      ? optimisticClaimedBy.value
      : claimedBy;
  const isClaimedByMe = displayedClaimedBy === currentUserEmail;
  const canUnclaim = isClaimedByMe || isOwner;
  const endpoint = `/api/conversations/${conversationId}/claim`;

  async function updateAssignment() {
    const method = displayedClaimedBy ? "DELETE" : "POST";
    const nextClaimedBy = method === "POST" ? currentUserEmail : null;

    setIsPending(true);
    setErrorMessage(null);
    setOptimisticClaimedBy({ base: claimedBy, value: nextClaimedBy });

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { Accept: "application/json" },
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setOptimisticClaimedBy(null);
        if (response.status === 409) {
          setErrorMessage("claimed by someone else");
        } else {
          setErrorMessage(
            getErrorMessage(body) ??
              "Unable to update assignment. Please try again.",
          );
        }
        return;
      }

      onAssignmentChange?.(nextClaimedBy);
    } catch {
      setOptimisticClaimedBy(null);
      setErrorMessage(
        "Unable to update assignment. Please check your connection and try again.",
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={
          displayedClaimedBy
            ? "rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700"
            : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
        }
        aria-label={
          displayedClaimedBy
            ? `Assigned to ${displayedClaimedBy}`
            : "Unassigned"
        }
      >
        {displayedClaimedBy
          ? isClaimedByMe
            ? "Assigned to you"
            : `Assigned to ${displayedClaimedBy}`
          : "Unassigned"}
      </span>

      {(!displayedClaimedBy || canUnclaim) && (
        <button
          type="button"
          onClick={updateAssignment}
          disabled={isPending}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Updating…" : displayedClaimedBy ? "Unclaim" : "Claim"}
        </button>
      )}

      {displayedClaimedBy && !canUnclaim && (
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
