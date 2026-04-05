/**
 * NeuroVision — In-page floating panel for AI results (DOM + styles + drag).
 */
(function () {
  "use strict";

  const NV = (window.NeuroVision = window.NeuroVision || {});

  let _panel = null;
  let _abortCtrl = null;

  function getOrCreate() {
    if (_panel && document.body.contains(_panel)) return _panel;

    const panel = document.createElement("div");
    panel.id = "nv-ai-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "NeuroVision AI Result");
    panel.setAttribute("aria-live", "polite");

    panel.innerHTML = `
      <div class="nv-aip-header">
        <span class="nv-aip-icon">🧠</span>
        <span class="nv-aip-title" id="nv-aip-title">NeuroVision AI</span>
        <div class="nv-aip-header-actions">
          <button class="nv-aip-btn" id="nv-aip-copy" title="Copy to clipboard" aria-label="Copy">📋</button>
          <button class="nv-aip-btn" id="nv-aip-close" title="Close" aria-label="Close panel">✕</button>
        </div>
      </div>
      <div class="nv-aip-body" id="nv-aip-body"></div>
    `;

    document.body.appendChild(panel);
    _panel = panel;

    panel.querySelector("#nv-aip-close").addEventListener("click", () => {
      panel.style.display = "none";
      if (_abortCtrl) { _abortCtrl.abort(); _abortCtrl = null; }
    });

    panel.querySelector("#nv-aip-copy").addEventListener("click", () => {
      const text = panel.querySelector("#nv-aip-body").textContent;
      navigator.clipboard.writeText(text).catch(() => {});
    });

    makeDraggable(panel);
    return panel;
  }

  function makeDraggable(el) {
    let ox = 0, oy = 0, mx = 0, my = 0;
    const header = el.querySelector(".nv-aip-header");
    if (!header) return;
    header.style.cursor = "move";
    header.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      e.preventDefault();
      mx = e.clientX; my = e.clientY;
      document.addEventListener("mousemove", onDrag);
      document.addEventListener("mouseup", stopDrag, { once: true });
    });
    function onDrag(e) {
      ox = mx - e.clientX; oy = my - e.clientY;
      mx = e.clientX; my = e.clientY;
      el.style.top = (el.offsetTop - oy) + "px";
      el.style.right = "auto";
      el.style.left = (el.offsetLeft - ox) + "px";
    }
    function stopDrag() {
      document.removeEventListener("mousemove", onDrag);
    }
  }

  function injectStyles() {
    if (document.getElementById("nv-ai-panel-styles")) return;
    const style = document.createElement("style");
    style.id = "nv-ai-panel-styles";
    style.textContent = `
      #nv-ai-panel {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 360px;
        max-height: 480px;
        background: #1E293B;
        color: #E2E8F0;
        border-radius: 14px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.45);
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
        line-height: 1.6;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.1);
      }
      .nv-aip-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        background: rgba(255,255,255,0.06);
        border-bottom: 1px solid rgba(255,255,255,0.08);
        flex-shrink: 0;
        user-select: none;
      }
      .nv-aip-icon { font-size: 18px; flex-shrink: 0; }
      .nv-aip-title {
        font-weight: 600;
        font-size: 13px;
        color: #94A3B8;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        flex: 1;
      }
      .nv-aip-header-actions { display: flex; gap: 4px; }
      .nv-aip-btn {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 14px;
        color: #64748B;
        padding: 2px 6px;
        border-radius: 4px;
        transition: background 0.15s, color 0.15s;
      }
      .nv-aip-btn:hover { background: rgba(255,255,255,0.1); color: #E2E8F0; }
      .nv-aip-body {
        padding: 14px;
        overflow-y: auto;
        white-space: pre-wrap;
        flex: 1;
        color: #CBD5E1;
        font-size: 13px;
        line-height: 1.7;
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.15) transparent;
      }
      .nv-aip-body::-webkit-scrollbar { width: 4px; }
      .nv-aip-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
      .nv-aip-streaming::after {
        content: "▌";
        animation: nv-blink 0.7s steps(1) infinite;
        color: #60A5FA;
      }
      @keyframes nv-blink { 50% { opacity: 0; } }
    `;
    document.head.appendChild(style);
  }

  function show(title, content, streaming = false) {
    const panel = getOrCreate();
    panel.style.display = "flex";
    panel.querySelector("#nv-aip-title").textContent = title;
    const body = panel.querySelector("#nv-aip-body");
    body.textContent = content;
    if (streaming) body.classList.add("nv-aip-streaming");
    else body.classList.remove("nv-aip-streaming");
    return body;
  }

  NV.contentAiPanel = {
    getOrCreate,
    injectStyles,
    show,
    setAbortCtrl(ctrl) { _abortCtrl = ctrl; },
    getAbortCtrl() { return _abortCtrl; },
  };
})();
