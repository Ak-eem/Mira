/**
 * Mira embeddable chat widget.
 *
 * Usage:
 *   <script src="https://<your-mira-host>/embed.js"
 *           data-business="your-business-slug"
 *           data-title="Chat with us"
 *           data-primary-color="#0f766e"
 *           data-position="right"    (optional: "right" (default) or "left")
 *           data-offset-x="20"       (optional: px from that side edge, default 20)
 *           data-offset-y="20"       (optional: px from the bottom, default 20; raise it to clear your own buttons)
 *           data-top-gap="88"        (optional: px kept free above the open panel so it never covers your sticky header, default 88)
 *           defer></script>
 *
 * No dependencies, works on any site regardless of framework. Styles live
 * inside a shadow root so the host page's CSS can't leak in and this
 * widget's CSS can't leak out.
 */
(function () {
  "use strict";

  if (window.MiraChat) return; // script included twice -- don't double-init

  var scriptEl = document.currentScript;
  if (!scriptEl) {
    console.error("Mira: couldn't locate its own <script> tag (data-* attributes unreadable).");
    return;
  }

  var businessSlug = scriptEl.getAttribute("data-business");
  if (!businessSlug) {
    console.error("Mira: data-business is required on the embed <script> tag.");
    return;
  }

  var title = scriptEl.getAttribute("data-title") || "Chat with us";
  var primaryColor = scriptEl.getAttribute("data-primary-color") || "#0f766e";
  // Where the chat button sits. Mira cannot see the host page, so a site that already has a floating button
  // (cart, WhatsApp...) in the bottom-right corner can move this one with data-position / data-offset-*.
  var side = scriptEl.getAttribute("data-position") === "left" ? "left" : "right";
  function pxAttr(name, fallback) {
    var n = parseInt(scriptEl.getAttribute(name), 10);
    return isFinite(n) && n >= 0 && n <= 400 ? n : fallback;
  }
  var offsetX = pxAttr("data-offset-x", 20);
  var offsetY = pxAttr("data-offset-y", 20);
  var topGap = pxAttr("data-top-gap", 88); // room left above the panel for the host page's own header
  var panelBottom = offsetY + 68; // the panel opens just above the button
  // dvh follows the visible area on phones (100vh counts the part hidden behind the browser toolbar),
  // so each size is written twice: vh first as the fallback for browsers without dvh, then dvh.
  function sized(prop, expr) {
    return prop + ": " + expr.replace(/dvh/g, "vh") + "; " + prop + ": " + expr + ";";
  }
  var panelHeightExpr = "min(640px, calc(100dvh - " + (panelBottom + topGap) + "px))";
  var origin = new URL(scriptEl.src, window.location.href).origin;
  var chatUrl = origin + "/chat/" + encodeURIComponent(businessSlug) + "?embed=1";

  var isOpen = false;
  var isExpanded = false;
  var iframeLoaded = false;
  var iframeEl = null;
  var iframeReady = false; // the chat page has said it is listening
  var wantFocus = false; // a person opened the chat and expects to type straight away

  var host = document.createElement("div");
  host.id = "mira-chat-widget-host";
  // Colours live in CSS variables on the host so the business's brand colour (returned by
  // the status check below) can be applied without rebuilding the widget. data-primary-color
  // on the script tag still works and is the fallback when no brand colour is set.
  function setColors(bg, fg) {
    if (host.style && host.style.setProperty) {
      host.style.setProperty("--mira-bg", bg);
      host.style.setProperty("--mira-fg", fg);
    }
  }
  setColors(primaryColor, "#ffffff");
  // The shell (panel, controls strip) is painted from the owner's chat colours so it matches the chat
  // inside the iframe. These are the defaults; the status check below replaces them when the owner set a
  // chat background.
  function setShell(bg, ink, surface, line) {
    if (host.style && host.style.setProperty) {
      host.style.setProperty("--mira-shell-bg", bg);
      host.style.setProperty("--mira-shell-ink", ink);
      host.style.setProperty("--mira-shell-surface", surface);
      host.style.setProperty("--mira-shell-line", line);
    }
  }
  setShell("#ffffff", "#475569", "#ffffff", "#eceff3");
  var shadow = host.attachShadow({ mode: "open" });

  var SPRING = ["width", "height", "top", "right", "bottom", "left"]
    .map(function (prop) { return prop + " 0.52s cubic-bezier(0.34, 1.56, 0.64, 1)"; })
    .join(", ");

  var style = document.createElement("style");
  style.textContent = [
    ":host, * { box-sizing: border-box; }",
    ".mira-bubble {",
    "  position: fixed; bottom: " + offsetY + "px; " + side + ": " + offsetX + "px; z-index: 2147483000;",
    "  width: 56px; height: 56px; border-radius: 999px; border: none; cursor: pointer;",
    "  background: var(--mira-bg); color: var(--mira-fg); box-shadow: 0 6px 20px rgba(0,0,0,0.25);",
    "  display: flex; align-items: center; justify-content: center;",
    "  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s ease;",
    "}",
    ".mira-bubble:hover { transform: scale(1.06); }",
    // Two-tone ring so keyboard focus shows on a light or a dark host page; the transparent outline
    // keeps it visible in forced-colours mode, which drops box-shadow.
    ".mira-bubble:focus-visible { outline: 2px solid transparent; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #0f172a, 0 6px 20px rgba(0,0,0,0.25); }",
    ".mira-bubble svg { width: 26px; height: 26px; }",
    // The launcher stays on screen and turns into a close button while the chat is open, so it always
    // exists as a keyboard target. Only the expanded panel covers it, and that has its own controls.
    ".mira-bubble .mira-icon-close { display: none; }",
    ".mira-bubble.mira-bubble-open .mira-icon-chat { display: none; }",
    ".mira-bubble.mira-bubble-open .mira-icon-close { display: block; }",
    ".mira-panel.mira-expanded.mira-open ~ .mira-bubble { opacity: 0; visibility: hidden; pointer-events: none; }",
    ".mira-panel {",
    "  position: fixed; bottom: " + panelBottom + "px; " + side + ": " + offsetX + "px; z-index: 2147483000;",
    "  width: 380px; max-width: calc(100vw - 24px); " + sized("height", panelHeightExpr) + " min-height: 280px;",
    // Solid and painted from the owner's colours: a see-through panel over an unknown host page gives
    // unpredictable contrast, and backdrop-filter inside an iframe cannot blur the page behind it.
    "  background: var(--mira-shell-bg); color: var(--mira-shell-ink); border: 1px solid var(--mira-shell-line);",
    "  border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.25);",
    "  display: flex; flex-direction: column; overflow: hidden;",
    // visibility:hidden takes the closed panel (and the iframe in it) out of the tab order and the
    // accessibility tree; its delay lets the fade finish first.
    "  opacity: 0; visibility: hidden; transform: translateY(12px) scale(0.98); pointer-events: none;",
    "  transition: opacity 0.18s ease, transform 0.18s ease, visibility 0s linear 0.18s, " + SPRING + ";",
    "}",
    ".mira-panel.mira-open {",
    "  opacity: 1; visibility: visible; transform: translateY(0) scale(1); pointer-events: auto;",
    "  transition: opacity 0.18s ease, transform 0.18s ease, visibility 0s, " + SPRING + ";",
    "}",
    ".mira-panel.mira-expanded {",
    "  width: min(920px, calc(100vw - 48px)); " + sized("height", "min(780px, calc(100dvh - 48px))"),
    "  bottom: 24px; " + side + ": 24px;",
    "}",
    ".mira-panel-controls {",
    "  display: flex; align-items: center; justify-content: space-between; gap: 8px;",
    "  min-height: 48px; padding: 8px 12px 0; flex: 0 0 auto;",
    "}",
    ".mira-panel-brand { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1 1 auto; color: var(--mira-shell-ink);",
    "  font: 600 13px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }",
    ".mira-panel-brand-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    ".mira-panel-brand-mark { display: grid; flex: 0 0 auto; width: 28px; height: 28px; place-items: center;",
    "  border-radius: 999px; background: var(--mira-shell-surface); background: color-mix(in srgb, var(--mira-bg) 14%, var(--mira-shell-bg)); color: var(--mira-bg); }",
    ".mira-panel-brand-mark svg { width: 15px; height: 15px; }",
    ".mira-panel-control {",
    "  display: flex; align-items: center; justify-content: center;",
    "  width: 36px; height: 36px; border: 1px solid var(--mira-shell-line); border-radius: 999px;",
    "  background: var(--mira-shell-surface); color: var(--mira-shell-ink); cursor: pointer;",
    "}",
    ".mira-panel-control-group { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; }",
    ".mira-panel-control:hover { background: var(--mira-shell-line); }",
    ".mira-panel-control:focus-visible { outline: 2px solid var(--mira-bg); outline-offset: 2px; }",
    ".mira-panel-control svg { width: 16px; height: 16px; }",
    ".mira-panel iframe { flex: 1; border: none; width: 100%; height: 100%; background: transparent; }",
    "@media (max-width: 480px) {",
    "  .mira-panel {",
    "    right: 12px; left: 12px; bottom: " + panelBottom + "px; width: auto; max-width: none;",
    "    " + sized("height", panelHeightExpr),
    "  }",
    "  .mira-panel.mira-expanded {",
    "    right: 8px; bottom: 8px; left: 8px; width: auto; " + sized("height", "calc(100dvh - 16px)") + " max-width: none;",
    "  }",
    "  .mira-panel-controls { min-height: 44px; padding-top: 6px; }",
    // On a phone the compact panel already fills the width, so expanding gains almost nothing.
    "  .mira-panel-control-expand { display: none; }",
    "}",
    "@media (prefers-reduced-motion: reduce) {",
    "  .mira-bubble, .mira-panel { transition: none; }",
    "}",
  ].join("\n");

  var bubble = document.createElement("button");
  bubble.type = "button";
  bubble.className = "mira-bubble";
  bubble.setAttribute("aria-label", title);
  bubble.setAttribute("aria-expanded", "false");
  bubble.innerHTML =
    '<svg class="mira-icon-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
    "</svg>" +
    '<svg class="mira-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="m6 9 6 6 6-6"/>' +
    "</svg>";

  var panel = document.createElement("div");
  panel.className = "mira-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", title);

  var controls = document.createElement("div");
  controls.className = "mira-panel-controls";

  var brand = document.createElement("div");
  brand.className = "mira-panel-brand";
  var brandMark = document.createElement("span");
  brandMark.className = "mira-panel-brand-mark";
  brandMark.setAttribute("aria-hidden", "true");
  brandMark.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/></svg>';
  // The site owner's data-title, as text (never HTML), so it cannot inject markup.
  var brandLabel = document.createElement("span");
  brandLabel.className = "mira-panel-brand-label";
  brandLabel.textContent = title;
  brand.appendChild(brandMark);
  brand.appendChild(brandLabel);

  var expandBtn = document.createElement("button");
  expandBtn.type = "button";
  expandBtn.className = "mira-panel-control mira-panel-control-expand";
  expandBtn.setAttribute("aria-label", "Expand chat");
  expandBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"/></svg>';
  expandBtn.addEventListener("click", function () {
    isExpanded = !isExpanded;
    panel.classList.toggle("mira-expanded", isExpanded);
    expandBtn.setAttribute("aria-label", isExpanded ? "Restore chat size" : "Expand chat");
    expandBtn.setAttribute("aria-pressed", isExpanded ? "true" : "false");
  });

  var minimizeBtn = document.createElement("button");
  minimizeBtn.type = "button";
  minimizeBtn.className = "mira-panel-control";
  minimizeBtn.setAttribute("aria-label", "Minimize chat");
  minimizeBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>';
  minimizeBtn.addEventListener("click", function () { close(); });

  var controlButtons = document.createElement("div");
  controlButtons.className = "mira-panel-control-group";
  controlButtons.appendChild(expandBtn);
  controlButtons.appendChild(minimizeBtn);
  controls.appendChild(brand);
  controls.appendChild(controlButtons);
  panel.appendChild(controls);

  shadow.appendChild(style);
  shadow.appendChild(panel);
  shadow.appendChild(bubble);

  bubble.addEventListener("click", function () { toggle(true); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen) close();
  });

  function ensureIframe() {
    if (iframeLoaded) return;
    iframeLoaded = true;
    iframeEl = document.createElement("iframe");
    iframeEl.src = chatUrl;
    iframeEl.title = title;
    panel.appendChild(iframeEl);
  }

  // Put the cursor in the chat's message box. Only done when a person opened the chat themselves,
  // never for MiraChat.open() called by the site, which must not steal focus from the page.
  function requestFocus() {
    if (!isOpen || !iframeEl) return;
    if (typeof iframeEl.focus === "function") iframeEl.focus();
    if (!iframeReady) {
      wantFocus = true; // the chat page is still loading; it tells us when it can take focus
      return;
    }
    wantFocus = false;
    try {
      if (iframeEl.contentWindow) iframeEl.contentWindow.postMessage({ type: "mira:focus" }, origin);
    } catch (e) { /* the chat page is not reachable yet; the iframe focus above still applies */ }
  }

  function widgetHasFocus() {
    var active = shadow.activeElement;
    return !!(active && typeof panel.contains === "function" && panel.contains(active));
  }

  function open(byPerson) {
    if (isOpen) return;
    ensureIframe();
    isOpen = true;
    panel.classList.add("mira-open");
    bubble.classList.add("mira-bubble-open");
    bubble.setAttribute("aria-expanded", "true");
    if (byPerson) requestFocus();
  }

  function close() {
    if (!isOpen) return;
    // If focus is inside the widget it would be lost when the panel hides, so hand it back to the launcher.
    var returnFocus = widgetHasFocus();
    isOpen = false;
    wantFocus = false;
    panel.classList.remove("mira-open");
    bubble.classList.remove("mira-bubble-open");
    bubble.setAttribute("aria-expanded", "false");
    if (returnFocus && typeof bubble.focus === "function") bubble.focus();
  }

  function toggle(byPerson) {
    if (isOpen) close();
    else open(byPerson);
  }

  var removed = false;

  // Take the widget off the page entirely (cancelled or missing business).
  // Idempotent. The host page's own script may still call MiraChat.open(), so
  // the API stays defined and simply does nothing.
  function removeWidget() {
    removed = true;
    isOpen = false;
    if (host.parentNode) host.parentNode.removeChild(host);
  }

  // Messages from the chat page inside the iframe. Only our own origin is trusted. Removal
  // (the page saying "Business not found") only needs that; the messages that act on the open
  // panel must also come from our own iframe's window.
  window.addEventListener("message", function (event) {
    if (event.origin !== origin) return;
    var type = event.data && event.data.type;
    if (type === "mira:unavailable") {
      removeWidget();
      return;
    }
    if (!iframeEl || event.source !== iframeEl.contentWindow) return;
    if (type === "mira:close") close();
    else if (type === "mira:ready") {
      iframeReady = true;
      if (wantFocus) requestFocus();
    }
  });

  function mount() {
    if (removed || host.parentNode) return;
    document.body.appendChild(host);
  }

  // Ask Mira whether this business is switched on BEFORE showing anything, so a
  // cancelled business never gets a bubble at all. Fails open: if the check
  // can't complete (offline, blocked, slow), show the widget and let the chat
  // page decide.
  function checkThenMount() {
    if (typeof fetch !== "function") return mount();
    var done = false;
    function finish(available) {
      if (done) return;
      done = true;
      if (available) mount();
      else removeWidget();
    }
    var timer = setTimeout(function () { finish(true); }, 4000);
    fetch(origin + "/api/embed/status?slug=" + encodeURIComponent(businessSlug), { cache: "no-store" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        clearTimeout(timer);
        var hex = /^#[0-9a-fA-F]{6}$/;
        if (data && hex.test(data.brandColor) && hex.test(data.onBrandColor)) setColors(data.brandColor, data.onBrandColor);
        if (data && hex.test(data.shellBackground) && hex.test(data.shellInk) && hex.test(data.shellSurface) && hex.test(data.shellLine)) {
          setShell(data.shellBackground, data.shellInk, data.shellSurface, data.shellLine);
        }
        finish(!(data && data.available === false));
      })
      .catch(function () { clearTimeout(timer); finish(true); });
  }

  window.MiraChat = {
    open: function () { if (!removed) open(false); },
    close: close,
    toggle: function () { if (!removed) toggle(false); },
  };

  checkThenMount();
})();
