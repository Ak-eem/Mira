/**
 * Mira embeddable chat widget.
 *
 * Usage:
 *   <script src="https://<your-mira-host>/embed.js"
 *           data-business="your-business-slug"
 *           data-title="Chat with us"
 *           data-primary-color="#0f766e"
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
  var origin = new URL(scriptEl.src, window.location.href).origin;
  var chatUrl = origin + "/chat/" + encodeURIComponent(businessSlug) + "?embed=1";

  var isOpen = false;
  var iframeLoaded = false;

  var host = document.createElement("div");
  host.id = "mira-chat-widget-host";
  var shadow = host.attachShadow({ mode: "open" });

  var style = document.createElement("style");
  style.textContent = [
    ":host, * { box-sizing: border-box; }",
    ".mira-bubble {",
    "  position: fixed; bottom: 20px; right: 20px; z-index: 2147483000;",
    "  width: 56px; height: 56px; border-radius: 999px; border: none; cursor: pointer;",
    "  background: " + primaryColor + "; box-shadow: 0 6px 20px rgba(0,0,0,0.25);",
    "  display: flex; align-items: center; justify-content: center;",
    "  transition: transform 0.15s ease;",
    "}",
    ".mira-bubble:hover { transform: scale(1.06); }",
    ".mira-bubble:focus-visible { outline: 2px solid white; outline-offset: 2px; }",
    ".mira-bubble svg { width: 26px; height: 26px; }",
    ".mira-panel {",
    "  position: fixed; bottom: 88px; right: 20px; z-index: 2147483000;",
    "  width: 380px; max-width: calc(100vw - 24px); height: 600px; max-height: calc(100vh - 120px);",
    "  background: white; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.25);",
    "  display: flex; flex-direction: column; overflow: hidden;",
    "  opacity: 0; transform: translateY(12px) scale(0.98); pointer-events: none;",
    "  transition: opacity 0.18s ease, transform 0.18s ease;",
    "}",
    ".mira-panel.mira-open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }",
    ".mira-panel-header {",
    "  display: flex; align-items: center; justify-content: space-between;",
    "  padding: 12px 14px; background: " + primaryColor + "; color: white;",
    "  font: 600 14px/1.3 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;",
    "  flex-shrink: 0;",
    "}",
    ".mira-panel-close {",
    "  background: transparent; border: none; color: white; cursor: pointer;",
    "  width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center;",
    "}",
    ".mira-panel-close:hover { background: rgba(255,255,255,0.15); }",
    ".mira-panel iframe { flex: 1; border: none; width: 100%; height: 100%; }",
    "@media (max-width: 480px) {",
    "  .mira-panel {",
    "    right: 12px; left: 12px; bottom: 88px; width: auto; max-width: none;",
    "    height: calc(100vh - 120px);",
    "  }",
    "}",
    "@media (prefers-reduced-motion: reduce) {",
    "  .mira-bubble, .mira-panel { transition: none; }",
    "}",
  ].join("\n");

  var bubble = document.createElement("button");
  bubble.type = "button";
  bubble.className = "mira-bubble";
  bubble.setAttribute("aria-label", title);
  bubble.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
    "</svg>";

  var panel = document.createElement("div");
  panel.className = "mira-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", title);

  var header = document.createElement("div");
  header.className = "mira-panel-header";

  var headerTitle = document.createElement("span");
  headerTitle.textContent = title;

  var closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "mira-panel-close";
  closeBtn.setAttribute("aria-label", "Close chat");
  closeBtn.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  closeBtn.addEventListener("click", close);

  header.appendChild(headerTitle);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  shadow.appendChild(style);
  shadow.appendChild(panel);
  shadow.appendChild(bubble);
  document.body.appendChild(host);

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
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    panel.classList.remove("mira-open");
    bubble.setAttribute("aria-expanded", "false");
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  window.MiraChat = { open: open, close: close, toggle: toggle };
})();
