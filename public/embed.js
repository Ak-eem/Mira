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
  var panelBottom = offsetY + 68; // the panel opens just above the button
  var panelHeightCss = "min(640px, calc(100vh - " + (panelBottom + 24) + "px))";
  var origin = new URL(scriptEl.src, window.location.href).origin;
  var chatUrl = origin + "/chat/" + encodeURIComponent(businessSlug) + "?embed=1";

  var isOpen = false;
  var isExpanded = false;
  var iframeLoaded = false;

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
  var shadow = host.attachShadow({ mode: "open" });

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
    ".mira-panel.mira-open ~ .mira-bubble { opacity: 0; visibility: hidden; pointer-events: none; }",
    ".mira-bubble:hover { transform: scale(1.06); }",
    ".mira-bubble:focus-visible { outline: 2px solid white; outline-offset: 2px; }",
    ".mira-bubble svg { width: 26px; height: 26px; }",
    ".mira-panel {",
    "  position: fixed; bottom: " + panelBottom + "px; " + side + ": " + offsetX + "px; z-index: 2147483000;",
    "  width: 380px; max-width: calc(100vw - 24px); height: " + panelHeightCss + "; min-height: 280px;",
    "  background: rgba(255,255,255,0.82); border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.25);",
    "  display: flex; flex-direction: column; overflow: hidden;",
    "  opacity: 0; transform: translateY(12px) scale(0.98); pointer-events: none;",
    "  transition: opacity 0.18s ease, transform 0.18s ease,",
    "    width 0.52s cubic-bezier(0.34, 1.56, 0.64, 1), height 0.52s cubic-bezier(0.34, 1.56, 0.64, 1),",
    "    top 0.52s cubic-bezier(0.34, 1.56, 0.64, 1), right 0.52s cubic-bezier(0.34, 1.56, 0.64, 1),",
    "    bottom 0.52s cubic-bezier(0.34, 1.56, 0.64, 1), left 0.52s cubic-bezier(0.34, 1.56, 0.64, 1);",
    "}",
    ".mira-panel.mira-open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }",
    ".mira-panel.mira-expanded {",
    "  width: min(920px, calc(100vw - 48px)); height: min(780px, calc(100vh - 48px));",
    "  bottom: 24px; " + side + ": 24px;",
    "}",
    ".mira-panel-controls {",
    "  display: flex; align-items: center; justify-content: space-between; gap: 8px;",
    "  min-height: 48px; padding: 8px 12px 0; flex: 0 0 auto;",
    "}",
    ".mira-panel-brand { display: flex; align-items: center; gap: 8px; color: #475569;",
    "  font: 600 13px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }",
    ".mira-panel-brand-mark { display: grid; width: 28px; height: 28px; place-items: center;",
    "  border-radius: 999px; background: color-mix(in srgb, var(--mira-bg) 12%, white); color: var(--mira-bg); }",
    ".mira-panel-brand-mark svg { width: 15px; height: 15px; }",
    ".mira-panel-control {",
    "  display: flex; align-items: center; justify-content: center;",
    "  width: 36px; height: 36px; border: 1px solid rgba(15, 23, 42, .06); border-radius: 999px;",
    "  background: white; color: #475569; box-shadow: 0 2px 8px rgba(15, 23, 42, .08); cursor: pointer;",
    "}",
    ".mira-panel-control-group { display: flex; align-items: center; gap: 8px; }",
    ".mira-panel-control:hover { background: #f8fafc; color: #0f172a; }",
    ".mira-panel-control:focus-visible { outline: 2px solid var(--mira-bg); outline-offset: 2px; }",
    ".mira-panel-control svg { width: 16px; height: 16px; }",
    ".mira-panel iframe { flex: 1; border: none; width: 100%; height: 100%; background: transparent; }",
    "@media (max-width: 480px) {",
    "  .mira-panel {",
    "    right: 12px; left: 12px; bottom: " + panelBottom + "px; width: auto; max-width: none;",
    "    height: " + panelHeightCss + ";",
    "  }",
    "  .mira-panel.mira-expanded {",
    "    right: 8px; bottom: 8px; left: 8px; width: auto; height: calc(100vh - 16px); max-width: none;",
    "  }",
    "  .mira-panel-controls { min-height: 44px; padding-top: 6px; }",
    "}",
    "@media (prefers-reduced-motion: reduce) {",
    "  .mira-bubble, .mira-panel { transition: none; }",
    "}",
  ].join("\n");

  var bubble = document.createElement("button");
  bubble.type = "button";
  bubble.className = "mira-bubble";
  bubble.setAttribute("aria-label", title);
  bubble.setAttribute("aria-hidden", "false");
  bubble.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
    "</svg>";

  var panel = document.createElement("div");
  panel.className = "mira-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", title);

  var controls = document.createElement("div");
  controls.className = "mira-panel-controls";

  var brand = document.createElement("div");
  brand.className = "mira-panel-brand";
  brand.innerHTML =
    '<span class="mira-panel-brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/></svg></span><span>Mira assistant</span>';

  var expandBtn = document.createElement("button");
  expandBtn.type = "button";
  expandBtn.className = "mira-panel-control";
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
  minimizeBtn.addEventListener("click", close);

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

  bubble.addEventListener("click", toggle);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen) close();
  });

  function ensureIframe() {
    if (iframeLoaded) return;
    iframeLoaded = true;
    var iframe = document.createElement("iframe");
    iframe.src = chatUrl;
    iframe.title = title;
    panel.appendChild(iframe);
  }

  function open() {
    if (isOpen) return;
    ensureIframe();
    isOpen = true;
    panel.classList.add("mira-open");
    bubble.setAttribute("aria-expanded", "true");
    bubble.setAttribute("aria-hidden", "true");
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    panel.classList.remove("mira-open");
    bubble.setAttribute("aria-expanded", "false");
    bubble.setAttribute("aria-hidden", "false");
  }

  function toggle() {
    if (isOpen) close();
    else open();
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

  // The chat page inside the iframe tells us when it has shown "Business not
  // found" so the bubble disappears from the owner's site. Only our own origin
  // is trusted, and the iframe is the only thing that can send this.
  window.addEventListener("message", function (event) {
    if (event.origin !== origin) return;
    if (event.data && event.data.type === "mira:close") {
      close();
      return;
    }
    if (event.data && event.data.type === "mira:unavailable") removeWidget();
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
        finish(!(data && data.available === false));
      })
      .catch(function () { clearTimeout(timer); finish(true); });
  }

  window.MiraChat = {
    open: function () { if (!removed) open(); },
    close: close,
    toggle: function () { if (!removed) toggle(); },
  };

  checkThenMount();
})();
