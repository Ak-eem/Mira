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
type Posted = Array<[unknown, string]>;

class FakeEl {
  tagName: string;
  focused = 0;
  activeElement: FakeEl | null = null; // only meaningful on the shadow root
  contentWindow: { posted: Posted; postMessage: (message: unknown, target: string) => void } | undefined;
  constructor(tag = "div") {
    this.tagName = tag;
    if (tag === "iframe") {
      const posted: Posted = [];
      this.contentWindow = { posted, postMessage: (message, target) => { posted.push([message, target]); } };
    }
  }
  focus() {
    this.focused += 1;
  }
  contains(other: FakeEl | null): boolean {
    if (!other) return false;
    if (other === this) return true;
    return this.children.some((child) => child.contains(other));
  }
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
    this.shadowRoot = new FakeEl("#shadow");
    return this.shadowRoot;
  }
}

type FetchImpl = (url: string) => Promise<{ json: () => Promise<unknown> }>;

function runEmbed(fetchImpl: FetchImpl | undefined, slug = "acme shop", attrs: Record<string, string> = {}) {
  const body = new FakeEl();
  const timers: Array<() => void> = [];
  const listeners: Record<string, Array<(e: unknown) => void>> = {};
  const fetched: string[] = [];
  const docListeners: Record<string, Array<(e: unknown) => void>> = {};

  const document = {
    body,
    currentScript: {
      src: `${MIRA}/embed.js`,
      getAttribute: (name: string) => (name === "data-business" ? slug : (attrs[name] ?? null)),
    },
    createElement: (tag: string) => new FakeEl(tag),
    addEventListener(type: string, fn: (e: unknown) => void) {
      (docListeners[type] ??= []).push(fn);
    },
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
  return { body, window, timers, listeners, docListeners, fetched };
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

  // ---- The widget itself -------------------------------------------------------------------
  const live = runEmbed(answer(true));
  await tick();
  const host = live.body.children[0];
  const style = host.shadowRoot?.children[0];
  const panel = host.shadowRoot?.children[1];
  const bubble = host.shadowRoot?.children[2];
  const controls = panel?.children[0];
  const [brand, controlButtons] = controls?.children ?? [];
  const [expandButton, minimizeButton] = controlButtons?.children ?? [];
  const css = style?.textContent ?? "";
  const MiraChat = live.window.MiraChat as { open: () => void; close: () => void; toggle: () => void };

  // Launcher: stays available while the chat is open (a hidden-but-focused button strands keyboard users).
  bubble?.listeners.click?.();
  check(bubble?.attributes["aria-hidden"] === undefined, "the launcher is never aria-hidden, open or closed");
  check(bubble?.classes.has("mira-bubble-open") === true && bubble?.attributes["aria-expanded"] === "true", "opening turns the launcher into a close button and marks it expanded");
  check(!/\.mira-panel\.mira-open ~ \.mira-bubble/.test(css), "the plain open panel does not hide the launcher");
  check(/\.mira-panel\.mira-expanded\.mira-open ~ \.mira-bubble \{[^}]*visibility: hidden/.test(css), "only the expanded panel (which covers it) hides the launcher");

  // Closed panel must not be reachable by keyboard or screen reader.
  check(/\.mira-panel \{[^}]*visibility: hidden/.test(css) && /\.mira-panel\.mira-open \{[^}]*visibility: visible/.test(css), "a closed panel is visibility:hidden, so it leaves the tab order");

  // Header: the site's own data-title, as text.
  check(brand?.children[1]?.textContent === "Chat with us", "the panel header shows the default title");
  const titled = runEmbed(answer(true), "acme", { "data-title": "<img src=x onerror=alert(1)>Ask Ada" });
  await tick();
  const titledLabel = titled.body.children[0].shadowRoot?.children[1]?.children[0]?.children[0]?.children[1];
  check(titledLabel?.textContent === "<img src=x onerror=alert(1)>Ask Ada" && !titledLabel?.innerHTML, "data-title is set as text, never parsed as HTML");

  // Expand / minimize.
  expandButton?.listeners.click?.();
  check(panel?.classList.contains("mira-expanded") === true, "the expand control enlarges the widget panel");
  check(expandButton?.attributes["aria-label"] === "Restore chat size", "the expand control announces its restore action");
  expandButton?.listeners.click?.();
  check(panel?.classList.contains("mira-expanded") === false, "the expand control restores the compact panel");
  check(/@media \(max-width: 480px\)[\s\S]*\.mira-panel-control-expand \{ display: none; \}/.test(css), "the expand control is hidden on phones, where it would change almost nothing");

  // Focus: returned to the launcher only if it was inside the widget.
  const iframe = panel?.children[1];
  host.shadowRoot!.activeElement = null;
  const before = bubble?.focused ?? 0;
  minimizeButton?.listeners.click?.();
  check(panel?.classList.contains("mira-open") === false && bubble?.attributes["aria-expanded"] === "false" && bubble?.classes.has("mira-bubble-open") === false, "the minimize control closes the panel and resets the launcher");
  check((bubble?.focused ?? 0) === before, "closing does not take focus when it was not inside the widget");

  bubble?.listeners.click?.();
  host.shadowRoot!.activeElement = iframe ?? null;
  minimizeButton?.listeners.click?.();
  check((bubble?.focused ?? 0) === before + 1, "closing while focus is inside the widget hands focus back to the launcher");

  // Opening by a person focuses the chat; opening from the site's own code never steals focus.
  const iframeFocusedBefore = iframe?.focused ?? 0;
  MiraChat.open();
  check((iframe?.focused ?? 0) === iframeFocusedBefore, "MiraChat.open() from the site does not move focus");
  MiraChat.close();
  bubble?.listeners.click?.();
  check((iframe?.focused ?? 0) === iframeFocusedBefore + 1, "opening from the launcher moves focus into the chat");
  const win = iframe?.contentWindow;
  check((win?.posted.length ?? 0) === 0, "no focus message is sent before the chat page says it is ready");
  const onMessage = live.listeners.message[0];
  onMessage({ origin: MIRA, source: {}, data: { type: "mira:ready" } });
  check((win?.posted.length ?? 0) === 0, "mira:ready from a window that is not our iframe is ignored");
  onMessage({ origin: MIRA, source: win, data: { type: "mira:ready" } });
  check(win?.posted.length === 1 && JSON.stringify(win.posted[0]) === JSON.stringify([{ type: "mira:focus" }, MIRA]), "once ready, the widget asks the chat to focus its input, addressed to Mira's origin only");

  // Messages from the chat page.
  onMessage({ origin: "https://evil.example", source: win, data: { type: "mira:unavailable" } });
  check(live.body.children.length === 1, "a message from another origin is ignored");
  onMessage({ origin: MIRA, source: win, data: { type: "something-else" } });
  check(live.body.children.length === 1, "an unrelated message from Mira is ignored");
  check(panel?.classList.contains("mira-open") === true, "(the panel is open for the next checks)");
  onMessage({ origin: MIRA, source: {}, data: { type: "mira:close" } });
  check(panel?.classList.contains("mira-open") === true, "mira:close from a window that is not our iframe is ignored");
  onMessage({ origin: MIRA, source: win, data: { type: "mira:close" } });
  check(panel?.classList.contains("mira-open") === false && live.body.children.length === 1, "mira:close from our iframe closes the panel without removing the widget");

  bubble?.listeners.click?.();
  live.docListeners.keydown[0]({ key: "Enter" });
  check(panel?.classList.contains("mira-open") === true, "other keys do not close the panel");
  live.docListeners.keydown[0]({ key: "Escape" });
  check(panel?.classList.contains("mira-open") === false, "Escape closes the panel");

  onMessage({ origin: MIRA, source: {}, data: { type: "mira:unavailable" } });
  check(live.body.children.length === 0, "mira:unavailable from Mira removes the widget from the site");

  // ---- Colours: the shell is painted from the owner's chat colours ---------------------------
  check(on.body.children[0].styleProps["--mira-shell-bg"] === "#ffffff", "no chat colours from the status check: the shell is plain white");
  const shellAnswer = { available: true, shellBackground: "#0f172a", shellInk: "#ffffff", shellSurface: "#222b3d", shellLine: "#363e4f" };
  const dark = runEmbed(() => Promise.resolve({ json: () => Promise.resolve(shellAnswer) }));
  await tick();
  const darkProps = dark.body.children[0].styleProps;
  check(
    darkProps["--mira-shell-bg"] === "#0f172a" && darkProps["--mira-shell-ink"] === "#ffffff" &&
      darkProps["--mira-shell-surface"] === "#222b3d" && darkProps["--mira-shell-line"] === "#363e4f",
    "a chat background from the status check repaints the whole shell",
  );
  const partial = runEmbed(() => Promise.resolve({ json: () => Promise.resolve({ ...shellAnswer, shellInk: "white" }) }));
  await tick();
  check(partial.body.children[0].styleProps["--mira-shell-bg"] === "#ffffff", "a partly invalid shell colour set is ignored whole, never half-applied (no unreadable mix)");
  const hostileShell = runEmbed(() => Promise.resolve({ json: () => Promise.resolve({ ...shellAnswer, shellBackground: "red;background:url(//evil)" }) }));
  await tick();
  check(hostileShell.body.children[0].styleProps["--mira-shell-bg"] === "#ffffff", "a non-hex shell colour is ignored");
  check(!/rgba\(255,255,255,0\.82\)/.test(css) && /background: var\(--mira-shell-bg\)/.test(css), "the panel is solid and painted from the shell colour, not a see-through white");

  // ---- Size: clearance above the panel, and dvh with a vh fallback ---------------------------
  check(/height: min\(640px, calc\(100vh - 176px\)\);\s*height: min\(640px, calc\(100dvh - 176px\)\)/.test(css), "default: 88px kept clear above the panel (the old safety margin), vh fallback then dvh");
  const gap = runEmbed(answer(true), "acme", { "data-top-gap": "24" });
  await tick();
  check(/calc\(100dvh - 112px\)/.test(gap.body.children[0].shadowRoot?.children[0]?.textContent ?? ""), "data-top-gap lets a site shrink that clearance");
  const badGap = runEmbed(answer(true), "acme", { "data-top-gap": "-5" });
  await tick();
  check(/calc\(100dvh - 176px\)/.test(badGap.body.children[0].shadowRoot?.children[0]?.textContent ?? ""), "an invalid data-top-gap falls back to the default");
  check(/height: calc\(100vh - 16px\);\s*height: calc\(100dvh - 16px\)/.test(css), "expanded on a phone uses dvh, so the input is not hidden behind the browser toolbar");
}

void run();
