// Reviews many scraped drafts in one request: every ticked draft goes live,
// every unticked one is discarded.
//
// NOT all-or-nothing, and it never claims to be. Approving a product mirrors
// its image over the network and then calls approve_scrape_draft, each draft
// in its own database transaction, so one draft failing can't (and
// shouldn't) undo the others. Instead every draft gets its own outcome and
// the caller reports exactly what happened.
//
// All I/O is injected so the rules below are testable without Supabase.

export type PendingDraft = { id: string; kind: string; payload: unknown };

export type ReviewDeps = {
  /** Drafts among `ids` that are pending AND belong to this business. */
  loadPending(ids: string[]): Promise<{ drafts: PendingDraft[]; failed: boolean }>;
  /** Copies a candidate image into storage; throws if it can't. */
  mirrorImage(draftId: string, imageUrl: string): Promise<string | null>;
  approve(draftId: string, imageUrl: string | null): Promise<boolean>;
  reject(draftId: string): Promise<boolean>;
};

export type ItemOutcome =
  | { draftId: string; outcome: "approved"; imageFailed: boolean }
  | { draftId: string; outcome: "rejected" }
  | { draftId: string; outcome: "failed"; reason: string };

export type BatchResult =
  | {
      ok: true;
      outcomes: ItemOutcome[];
      summary: { approved: number; rejected: number; failed: number; imagesFailed: number };
    }
  | { ok: false; error: string };

// One scrape makes at most 100 drafts (MAX_ITEMS in extractBusinessInfo) and
// an owner can run a few scrapes before reviewing, so 200 covers real use
// while bounding how long one request can run.
export const MAX_BATCH = 200;
// Image mirroring is the slow part. A few at a time keeps a full review well
// inside a request's time limit without hammering the source site.
const CONCURRENCY = 4;

function cleanIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((v) => typeof v === "string" && v.length > 0 && v.length <= 64)) return null;
  return [...new Set(value as string[])];
}

async function inChunks<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map(fn));
  }
}

export async function reviewDraftsBatch(
  deps: ReviewDeps,
  input: { approveIds: unknown; rejectIds: unknown },
): Promise<BatchResult> {
  const approveIds = cleanIds(input.approveIds);
  const rejectIds = cleanIds(input.rejectIds);
  if (!approveIds || !rejectIds) return { ok: false, error: "Invalid request." };
  if (approveIds.length + rejectIds.length === 0) return { ok: false, error: "Nothing to review." };
  if (approveIds.length + rejectIds.length > MAX_BATCH) return { ok: false, error: "Too many items at once." };

  // An id on both lists is a contradiction. Refuse it outright rather than
  // pick a winner: approving something the owner also marked for discard
  // would put it live.
  const approveSet = new Set(approveIds);
  if (rejectIds.some((id) => approveSet.has(id))) return { ok: false, error: "Invalid request." };

  const pending = await deps.loadPending([...approveIds, ...rejectIds]);
  if (pending.failed) return { ok: false, error: "Couldn't load your drafts. Please try again." };
  const byId = new Map(pending.drafts.map((d) => [d.id, d]));

  const outcomes: ItemOutcome[] = [];
  const toApprove: PendingDraft[] = [];
  const toReject: string[] = [];

  for (const id of approveIds) {
    const draft = byId.get(id);
    if (draft) toApprove.push(draft);
    else outcomes.push({ draftId: id, outcome: "failed", reason: "Already reviewed or not found." });
  }
  for (const id of rejectIds) {
    if (byId.has(id)) toReject.push(id);
    else outcomes.push({ draftId: id, outcome: "failed", reason: "Already reviewed or not found." });
  }

  await inChunks(toApprove, async (draft) => {
    let imageUrl: string | null = null;
    let imageFailed = false;
    const payload = draft.kind === "product" && draft.payload && typeof draft.payload === "object" ? (draft.payload as Record<string, unknown>) : null;
    const candidate = typeof payload?.candidate_image_url === "string" ? payload.candidate_image_url : null;
    if (candidate) {
      try {
        imageUrl = await deps.mirrorImage(draft.id, candidate);
      } catch (error) {
        // The product is still worth adding; the owner can upload a photo later.
        imageFailed = true;
        console.warn("Could not mirror scraped product image.", error);
      }
    }
    const ok = await deps.approve(draft.id, imageUrl);
    outcomes.push(ok ? { draftId: draft.id, outcome: "approved", imageFailed } : { draftId: draft.id, outcome: "failed", reason: "Couldn't add this one." });
  });

  await inChunks(toReject, async (id) => {
    const ok = await deps.reject(id);
    outcomes.push(ok ? { draftId: id, outcome: "rejected" } : { draftId: id, outcome: "failed", reason: "Couldn't discard this one." });
  });

  return {
    ok: true,
    outcomes,
    summary: {
      approved: outcomes.filter((o) => o.outcome === "approved").length,
      rejected: outcomes.filter((o) => o.outcome === "rejected").length,
      failed: outcomes.filter((o) => o.outcome === "failed").length,
      imagesFailed: outcomes.filter((o) => o.outcome === "approved" && o.imageFailed).length,
    },
  };
}
