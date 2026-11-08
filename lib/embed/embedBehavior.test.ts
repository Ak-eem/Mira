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
  styleProps: Record<string, string> = {};
  style = { setProperty: (name: string, value: string) => { this.styleProps[name] = value; } };
  parentNode: FakeEl | null = null;
  children: FakeEl[] = [];
  className = "";
  innerHTML = "";
  textContent = "";
  attributes: Record<string, string> = {};
  listeners: Record<string, () => void> = {};
  shadowRoot: FakeEl | null = null;
  classes = new Set<string>();
  classList = {
    add: (...names: string[]) => names.forEach((name) => this.classes.add(name)),
    remove: (...names: string[]) => names.forEach((name) => this.classes.delete(name)),
    toggle: (name: string, force?: boolean) => {
      const add = force ?? !this.classes.has(name);
      if (add) this.classes.add(name);
      else this.classes.delete(name);
      return add;
    },
    contains: (name: string) => this.classes.has(name),
  };
  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners[type] = listener;
  }
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
    this.shadowRoot = new FakeEl();
    return this.shadowRoot;
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

  // Brand colour: applied from the status answer; anything that isn't a plain hex is ignored.
  check(on.body.children[0].styleProps["--mira-bg"] === "#0f766e", "no brand colour: the widget keeps its default colour");
  const branded = runEmbed(() =>
    Promise.resolve({ json: () => Promise.resolve({ available: true, brandColor: "#1a7f5a", onBrandColor: "#ffffff" }) }),
  );
  await tick();
  check(
    branded.body.children[0].styleProps["--mira-bg"] === "#1a7f5a" && branded.body.children[0].styleProps["--mira-fg"] === "#ffffff",
    "a brand colour from the status check recolours the widget",
  );
  const hostile = runEmbed(() =>
    Promise.resolve({ json: () => Promise.resolve({ available: true, brandColor: "red;background:url(//evil)", onBrandColor: "#fff" }) }),
  );
  await tick();
  check(hostile.body.children[0].styleProps["--mira-bg"] === "#0f766e", "a non-hex colour in the answer is ignored");

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
  const host = live.body.children[0];
  const panel = host.shadowRoot?.children[1];
  const bubble = host.shadowRoot?.children[2];
  const controls = panel?.children[0];
  const controlButtons = controls?.children[1]?.children ?? [];
  const [expandButton, minimizeButton] = controlButtons;
  (live.window.MiraChat as { open: () => void }).open();
  check(bubble?.attributes["aria-hidden"] === "true", "opening the panel hides the launcher from view and assistive technology");
  expandButton?.listeners.click?.();
  check(panel?.classList.contains("mira-expanded") === true, "the expand control enlarges the widget panel");
  check(expandButton?.attributes["aria-label"] === "Restore chat size", "the expand control announces its restore action");
  expandButton?.listeners.click?.();
  check(panel?.classList.contains("mira-expanded") === false, "the expand control restores the compact panel");
  minimizeButton?.listeners.click?.();
  check(
    panel?.classList.contains("mira-open") === false &&
      bubble?.attributes["aria-expanded"] === "false" &&
      bubble?.attributes["aria-hidden"] === "false",
    "the minimize control closes the panel and updates the launcher state",
  );

  const onMessage = live.listeners.message[0];
  onMessage({ origin: "https://evil.example", data: { type: "mira:unavailable" } });
  check(live.body.children.length === 1, "a message from another origin is ignored");
  onMessage({ origin: MIRA, data: { type: "something-else" } });
  check(live.body.children.length === 1, "an unrelated message from Mira is ignored");
  onMessage({ origin: MIRA, data: { type: "mira:close" } });
  check(live.body.children.length === 1, "mira:close closes the panel without removing the widget");
  onMessage({ origin: MIRA, data: { type: "mira:unavailable" } });
  check(live.body.children.length === 0, "mira:unavailable from Mira removes the widget from the site");
}

void run();
