import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

const SOURCE = readFileSync(join(__dirname, "../../public/embed.js"), "utf8");
const MIRA = "https://mira.example";

// Just enough DOM for embed.js: elements that track their parent, a body, a shadow root.
class FakeEl {
  parentNode: FakeEl | null = null;
  children: FakeEl[] = [];
  className = "";
  innerHTML = "";
  textContent = "";
  classList = { add() {}, remove() {} };
  setAttribute() {}
  addEventListener() {}
  appendChild(child: FakeEl) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child: FakeEl) {
    this.children = this.children.filter((c) => c !== child);
    child.parentNode = null;
    return child;
  }
  attachShadow() {
    return new FakeEl();
  }
}

type FetchImpl = (url: string) => Promise<{ json: () => Promise<unknown> }>;

function runEmbed(fetchImpl: FetchImpl | undefined, slug = "acme shop") {
  const body = new FakeEl();
  const timers: Array<() => void> = [];
  const listeners: Record<string, Array<(e: unknown) => void>> = {};
  const fetched: string[] = [];

  const document = {
    body,
    currentScript: {
      src: `${MIRA}/embed.js`,
      getAttribute: (name: string) => (name === "data-business" ? slug : null),
    },
    createElement: () => new FakeEl(),
    addEventListener() {},
  };
  const window: Record<string, unknown> = {
    location: { href: "https://customer-site.example/page" },
    addEventListener(type: string, fn: (e: unknown) => void) {
      (listeners[type] ??= []).push(fn);
    },
  };
  const context: Record<string, unknown> = {
    window,
    document,
    URL,
    console,
    encodeURIComponent,
    setTimeout: (fn: () => void) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimeout() {},
  };
  if (fetchImpl) {
    context.fetch = (url: string) => {
      fetched.push(url);
      return fetchImpl(url);
    };
  }
  vm.runInNewContext(SOURCE, context);
  return { body, window, timers, listeners, fetched };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
const answer = (available: boolean): FetchImpl => () => Promise.resolve({ json: () => Promise.resolve({ available }) });

async function run() {
  // A business that is switched on gets its bubble.
  const on = runEmbed(answer(true));
  await tick();
  check(on.body.children.length === 1, "an available business: the widget is mounted");
  check(
    on.fetched[0] === `${MIRA}/api/embed/status?slug=acme%20shop`,
    "asks Mira's status endpoint for the slug (url-encoded) on the Mira origin",
  );

  // The point of the feature: a cancelled business never shows anything.
  const off = runEmbed(answer(false));
  await tick();
  check(off.body.children.length === 0, "a cancelled business: nothing is ever added to the page");
  let threw = false;
  try {
    (off.window.MiraChat as { open: () => void; toggle: () => void }).open();
    (off.window.MiraChat as { open: () => void; toggle: () => void }).toggle();
  } catch {
    threw = true;
  }
  check(!threw, "the host page can still call MiraChat.open() without errors");

  // Fails open: an outage must not hide a paying business's chat.
  const down = runEmbed(() => Promise.reject(new Error("offline")));
  await tick();
  check(down.body.children.length === 1, "status check fails (network) -> widget still shown");

  const garbage = runEmbed(() => Promise.resolve({ json: () => Promise.reject(new Error("bad json")) }));
  await tick();
  check(garbage.body.children.length === 1, "status check returns garbage -> widget still shown");

  const slow = runEmbed(() => new Promise(() => {}));
  await tick();
  check(slow.body.children.length === 0, "while the check is pending, nothing flashes on screen");
  slow.timers[0]?.();
  await tick();
  check(slow.body.children.length === 1, "status check hangs past the 4s timeout -> widget shown");

  const noFetch = runEmbed(undefined);
  check(noFetch.body.children.length === 1, "no fetch available (very old browser) -> widget shown");

  // The chat iframe can ask the script to remove the widget -- but only Mira's own origin can.
  const live = runEmbed(answer(true));
  await tick();
  const onMessage = live.listeners.message[0];
  onMessage({ origin: "https://evil.example", data: { type: "mira:unavailable" } });
  check(live.body.children.length === 1, "a message from another origin is ignored");
  onMessage({ origin: MIRA, data: { type: "something-else" } });
  check(live.body.children.length === 1, "an unrelated message from Mira is ignored");
  onMessage({ origin: MIRA, data: { type: "mira:unavailable" } });
  check(live.body.children.length === 0, "mira:unavailable from Mira removes the widget from the site");
}

void run();
