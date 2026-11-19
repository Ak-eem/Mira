import { computeReveal, distanceFromBottom, FOLLOW_THRESHOLD, TALL_RATIO, TOP_PADDING } from "./scrollReveal";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

// Container 600px tall, content 3000px tall (max scroll 2400).
const base = { containerHeight: 600, scrollHeight: 3000 };

// A short reply in the middle of a long conversation is centred.
const mid = computeReveal({ ...base, elTop: 1000, elHeight: 100 });
check(mid.mode === "center" && mid.top === 1000 - (600 - 100) / 2, "a short reply mid-conversation is centred (top edge 250px above its own top)");

// A short reply at the very end can't be centred; it rests at the bottom.
const end = computeReveal({ ...base, elTop: 2900, elHeight: 100 });
check(end.mode === "center" && end.top === 2400, "a short reply at the very end rests at the bottom (cannot scroll past the end)");

// A tall reply starts at the top of the view.
const tall = computeReveal({ ...base, elTop: 1000, elHeight: 900 });
check(tall.mode === "top" && tall.top === 1000 - TOP_PADDING, "a tall reply lines its top up with the top of the chat");

// The tall/centre boundary.
const limit = 600 * TALL_RATIO;
check(computeReveal({ ...base, elTop: 1000, elHeight: limit }).mode === "center", "exactly at the 85% limit still counts as fitting");
check(computeReveal({ ...base, elTop: 1000, elHeight: limit + 1 }).mode === "top", "just over the limit is treated as tall");

// Never scrolls out of range.
check(computeReveal({ ...base, elTop: 20, elHeight: 50 }).top === 0, "near the top of the conversation it never goes below 0");
check(computeReveal({ containerHeight: 600, scrollHeight: 400, elTop: 300, elHeight: 100 }).top === 0, "when everything fits on screen there is nothing to scroll");
check(computeReveal({ ...base, elTop: 2950, elHeight: 800 }).top <= 2400, "a tall reply at the end still respects the maximum scroll");

// Following the conversation.
check(distanceFromBottom({ scrollHeight: 3000, scrollTop: 2400, clientHeight: 600 }) === 0, "scrolled to the bottom is 0 pixels from the bottom");
check(distanceFromBottom({ scrollHeight: 3000, scrollTop: 2000, clientHeight: 600 }) === 400, "400px above the bottom is 400");
check(distanceFromBottom({ scrollHeight: 500, scrollTop: 0, clientHeight: 600 }) === 0, "a conversation shorter than the view is never above the bottom");
check(distanceFromBottom({ scrollHeight: 3000, scrollTop: 2400 - FOLLOW_THRESHOLD + 1, clientHeight: 600 }) < FOLLOW_THRESHOLD, "just inside the threshold still counts as following");
check(distanceFromBottom({ scrollHeight: 3000, scrollTop: 2400 - FOLLOW_THRESHOLD, clientHeight: 600 }) >= FOLLOW_THRESHOLD, "at the threshold or beyond stops following");
