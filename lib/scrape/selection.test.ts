import { computeSelection, toggleAllUnticked, confirmLabel } from "./selection";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

function run() {
  const ids = ["a", "b", "c", "d"];

  const fresh = computeSelection(ids, new Set());
  check(fresh.approveIds.length === 4 && fresh.discardIds.length === 0 && fresh.allSelected, "with nothing unticked, everything is selected");

  const some = computeSelection(ids, new Set(["b", "d"]));
  check(some.approveIds.join() === "a,c" && some.discardIds.join() === "b,d" && !some.allSelected, "unticked items move from approve to discard, order preserved");

  const none = computeSelection(ids, new Set(ids));
  check(none.approveIds.length === 0 && none.discardIds.length === 4 && !none.allSelected, "unticking everything selects nothing");

  const stale = computeSelection(["a"], new Set(["gone", "alsoGone"]));
  check(stale.approveIds.join() === "a" && stale.discardIds.length === 0, "ids in `unticked` that are no longer pending are ignored, not discarded");

  const empty = computeSelection([], new Set());
  check(empty.approveIds.length === 0 && empty.discardIds.length === 0 && !empty.allSelected, "with no drafts, nothing is selected and 'all selected' is false");

  const a = [...fresh.approveIds, ...fresh.discardIds].sort().join();
  const b = [...some.approveIds, ...some.discardIds].sort().join();
  check(a === "a,b,c,d" && b === "a,b,c,d", "every draft is in exactly one of the two lists, always (nothing is dropped, nothing duplicated)");

  check(toggleAllUnticked(ids, true).size === 4, "'Unselect all' when everything is selected unticks every draft");
  check(toggleAllUnticked(ids, false).size === 0, "'Select all' when not everything is selected clears all unticks");

  check(confirmLabel(fresh, false) === "Add all 4", "label: everything ticked reads 'Add all N'");
  check(confirmLabel(some, false) === "Add 2 and discard 2", "label: a mix states BOTH counts, so discarding is never a surprise");
  check(confirmLabel(none, false) === "Discard all 4", "label: nothing ticked reads 'Discard all N', not a misleading 'Add'");
  check(confirmLabel(fresh, true) === "Saving...", "label while saving");
  check(confirmLabel(computeSelection(["a"], new Set()), false) === "Add all 1", "label with a single item");
}

run();
