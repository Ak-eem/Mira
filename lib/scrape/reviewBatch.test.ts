import { reviewDraftsBatch, MAX_BATCH, type ReviewDeps, type PendingDraft } from "./reviewBatch";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

// Records every call so tests can assert on what was (and wasn't) done.
function fakeDeps(opts: {
  pending: PendingDraft[];
  failApprove?: string[];
  failReject?: string[];
  failMirror?: string[];
  loadFails?: boolean;
}) {
  const calls = { approve: [] as { id: string; image: string | null }[], reject: [] as string[], mirror: [] as string[], loaded: [] as string[][] };
  const deps: ReviewDeps = {
    async loadPending(ids) {
      calls.loaded.push(ids);
      if (opts.loadFails) return { drafts: [], failed: true };
      return { drafts: opts.pending.filter((d) => ids.includes(d.id)), failed: false };
    },
    async mirrorImage(id, url) {
      calls.mirror.push(id);
      if (opts.failMirror?.includes(id)) throw new Error("not an image");
      return `https://cdn.test/${id}.jpg`;
    },
    async approve(id, image) {
      calls.approve.push({ id, image });
      return !opts.failApprove?.includes(id);
    },
    async reject(id) {
      calls.reject.push(id);
      return !opts.failReject?.includes(id);
    },
  };
  return { deps, calls };
}

const faq = (id: string): PendingDraft => ({ id, kind: "faq", payload: { question: "q", answer: "a" } });
const product = (id: string, image?: string): PendingDraft => ({ id, kind: "product", payload: { name: "Shirt", ...(image ? { candidate_image_url: image } : {}) } });

async function run() {
  const origWarn = console.warn;
  console.warn = () => {};

  // --- the main case: tick some, untick others ---
  {
    const { deps, calls } = fakeDeps({ pending: [faq("a"), faq("b"), faq("c"), faq("d")] });
    const r = await reviewDraftsBatch(deps, { approveIds: ["a", "b"], rejectIds: ["c", "d"] });
    check(r.ok && r.summary.approved === 2 && r.summary.rejected === 2 && r.summary.failed === 0, "ticked drafts are approved and unticked drafts are rejected in one request");
    check(calls.approve.map((c) => c.id).sort().join() === "a,b" && calls.reject.sort().join() === "c,d", "exactly the right drafts went to approve and to reject");
  }

  // --- contradictions and bad input never touch the database ---
  {
    const { deps, calls } = fakeDeps({ pending: [faq("a")] });
    const r = await reviewDraftsBatch(deps, { approveIds: ["a"], rejectIds: ["a"] });
    check(!r.ok && calls.approve.length === 0 && calls.reject.length === 0 && calls.loaded.length === 0, "an id on BOTH lists is refused before anything is read or written (it must never go live)");
  }
  {
    const { deps, calls } = fakeDeps({ pending: [] });
    check(!(await reviewDraftsBatch(deps, { approveIds: [], rejectIds: [] })).ok, "an empty review is refused");
    check(!(await reviewDraftsBatch(deps, { approveIds: "a", rejectIds: [] })).ok, "a non-array approve list is refused");
    check(!(await reviewDraftsBatch(deps, { approveIds: [1, 2], rejectIds: [] })).ok, "non-string ids are refused");
    check(!(await reviewDraftsBatch(deps, { approveIds: [""], rejectIds: [] })).ok, "an empty-string id is refused");
    check(!(await reviewDraftsBatch(deps, { approveIds: ["x".repeat(65)], rejectIds: [] })).ok, "an oversized id is refused");
    const many = Array.from({ length: MAX_BATCH + 1 }, (_, i) => `id${i}`);
    check(!(await reviewDraftsBatch(deps, { approveIds: many, rejectIds: [] })).ok, "a batch over the cap is refused");
    check(calls.approve.length === 0 && calls.reject.length === 0, "none of the refused requests did any work");
  }

  // --- duplicates are collapsed, not double-processed ---
  {
    const { deps, calls } = fakeDeps({ pending: [faq("a")] });
    await reviewDraftsBatch(deps, { approveIds: ["a", "a", "a"], rejectIds: [] });
    check(calls.approve.length === 1, "the same id repeated is approved once");
  }

  // --- ids that aren't this business's pending drafts ---
  {
    const { deps, calls } = fakeDeps({ pending: [faq("mine")] });
    const r = await reviewDraftsBatch(deps, { approveIds: ["mine", "someone-elses"], rejectIds: ["already-done"] });
    check(r.ok && r.summary.approved === 1 && r.summary.failed === 2, "ids not pending for this business are reported as failed, not silently dropped");
    check(calls.approve.length === 1 && calls.approve[0].id === "mine" && calls.reject.length === 0, "and no approve/reject is ever attempted for them");
  }

  // --- one failure doesn't stop the rest ---
  {
    const { deps } = fakeDeps({ pending: [faq("a"), faq("b"), faq("c")], failApprove: ["b"] });
    const r = await reviewDraftsBatch(deps, { approveIds: ["a", "b", "c"], rejectIds: [] });
    check(r.ok && r.summary.approved === 2 && r.summary.failed === 1, "one draft failing to approve doesn't stop the others");
    check(r.ok && r.outcomes.some((o) => o.draftId === "b" && o.outcome === "failed"), "and the failed one is named in the outcomes");
  }
  {
    const { deps } = fakeDeps({ pending: [faq("a"), faq("b")], failReject: ["a"] });
    const r = await reviewDraftsBatch(deps, { approveIds: [], rejectIds: ["a", "b"] });
    check(r.ok && r.summary.rejected === 1 && r.summary.failed === 1, "a discard failing is reported without hiding the one that worked");
  }

  // --- product images ---
  {
    const { deps, calls } = fakeDeps({ pending: [product("p1", "https://shop.test/a.jpg"), faq("f1")] });
    const r = await reviewDraftsBatch(deps, { approveIds: ["p1", "f1"], rejectIds: [] });
    check(calls.mirror.join() === "p1", "only a product with a candidate image gets its image mirrored");
    check(calls.approve.find((c) => c.id === "p1")?.image === "https://cdn.test/p1.jpg", "the mirrored URL, not the source site's, is what gets stored");
    check(calls.approve.find((c) => c.id === "f1")?.image === null, "a non-product draft is approved with no image");
    check(r.ok && r.summary.imagesFailed === 0, "no image failures reported when all succeeded");
  }
  {
    const { deps, calls } = fakeDeps({ pending: [product("p1", "https://shop.test/a.jpg")], failMirror: ["p1"] });
    const r = await reviewDraftsBatch(deps, { approveIds: ["p1"], rejectIds: [] });
    check(r.ok && r.summary.approved === 1 && r.summary.imagesFailed === 1, "a product whose image can't be imported is STILL approved, and the miss is counted");
    check(calls.approve[0].image === null, "it is approved without an image rather than with a broken one");
  }
  {
    const { deps, calls } = fakeDeps({ pending: [product("p1", "https://shop.test/a.jpg")] });
    await reviewDraftsBatch(deps, { approveIds: [], rejectIds: ["p1"] });
    check(calls.mirror.length === 0, "a product being DISCARDED never has its image fetched");
  }

  // --- infrastructure failure ---
  {
    const { deps, calls } = fakeDeps({ pending: [faq("a")], loadFails: true });
    const r = await reviewDraftsBatch(deps, { approveIds: ["a"], rejectIds: [] });
    check(!r.ok && calls.approve.length === 0, "if the pending drafts can't be loaded, nothing is approved");
  }

  // --- a full-size review completes and accounts for everything ---
  {
    const drafts = Array.from({ length: 100 }, (_, i) => faq(`d${i}`));
    const { deps } = fakeDeps({ pending: drafts });
    const r = await reviewDraftsBatch(deps, {
      approveIds: drafts.slice(0, 60).map((d) => d.id),
      rejectIds: drafts.slice(60).map((d) => d.id),
    });
    check(r.ok && r.outcomes.length === 100 && r.summary.approved === 60 && r.summary.rejected === 40, "a 100-draft review handles every draft exactly once");
  }

  console.warn = origWarn;
}

void run();
