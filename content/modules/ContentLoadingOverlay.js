/**
 * NeuroVision — Full-page transform progress overlay.
 */
(function () {
  "use strict";

  const NV = (window.NeuroVision = window.NeuroVision || {});

  /**
   * @param {object} [opts]
   * @param {string} [opts.title] — Headline under spinner
   * @param {function} [opts.onCancel] — Called when user clicks Cancel (default: exit reader mode)
   * @param {boolean} [opts.compact] — Bottom bar only; page stays visible (live updates)
   */
  function create(opts = {}) {
    const titleText = opts.title || "🧠 NeuroVision is reading this page…";
    const onCancel = typeof opts.onCancel === "function"
      ? opts.onCancel
      : () => { NV.pageTransformer.exitReaderMode(); };

    const el = document.createElement("div");
    el.id = "nv-transform-loading";
    if (opts.compact) el.classList.add("nv-tl-compact");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("role", "status");
    el.innerHTML = `
      <div class="nv-tl-spinner"></div>
      <div class="nv-tl-title" id="nv-tl-main-title">${titleText}</div>
      <div class="nv-tl-step" id="nv-tl-step">Starting…</div>
      <div class="nv-tl-bar-wrap">
        <div class="nv-tl-bar" id="nv-tl-bar" style="width:10%"></div>
      </div>
      <button class="nv-tl-cancel" id="nv-tl-cancel">Cancel</button>
    `;
    el.querySelector("#nv-tl-cancel")?.addEventListener("click", () => {
      el.remove();
      onCancel();
    });
    return el;
  }

  function update(el, pct, _total, msg) {
    const stepEl = el.querySelector("#nv-tl-step");
    const barEl  = el.querySelector("#nv-tl-bar");
    if (stepEl) stepEl.textContent = msg;
    if (barEl)  barEl.style.width  = Math.min(100, pct) + "%";
  }

  NV.contentLoadingOverlay = { create, update };
})();
