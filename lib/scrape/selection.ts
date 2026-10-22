// The tick-box arithmetic behind the website-import review screen, pulled
// out of the component so the part with real consequences (what the confirm
// button SAYS it will do, and which ids it sends) is covered by tests.

export type Selection = {
  approveIds: string[];
  discardIds: string[];
  allSelected: boolean;
};

/** Everything starts ticked; `unticked` holds only what the owner switched off. */
export function computeSelection(pendingIds: string[], unticked: ReadonlySet<string>): Selection {
  const approveIds = pendingIds.filter((id) => !unticked.has(id));
  const discardIds = pendingIds.filter((id) => unticked.has(id));
  return { approveIds, discardIds, allSelected: pendingIds.length > 0 && discardIds.length === 0 };
}

/** What "Select all / Unselect all" should leave unticked after a click. */
export function toggleAllUnticked(pendingIds: string[], allSelected: boolean): Set<string> {
  return allSelected ? new Set(pendingIds) : new Set();
}

export function confirmLabel(sel: Pick<Selection, "approveIds" | "discardIds">, busy: boolean): string {
  if (busy) return "Saving...";
  if (sel.approveIds.length === 0) return `Discard all ${sel.discardIds.length}`;
  if (sel.discardIds.length > 0) return `Add ${sel.approveIds.length} and discard ${sel.discardIds.length}`;
  return `Add all ${sel.approveIds.length}`;
}
