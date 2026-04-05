/**
 * NeuroVision — Autism Module
 *
 * Features:
 * - Sensory Dial: single slider controls all sensory parameters
 * - Color desaturation (CSS filter + computed style override)
 * - Animation removal (comprehensive CSS blanket)
 * - Flashing/blinking element removal
 * - Decorative image hiding
 * - Consistent spacing normalization
 * - Soft contrast mode
 * - Predictable layout enforcement
 * - LLM-assisted social/figurative language simplification
 */
(function () {
  "use strict";

  const NV = (window.NeuroVision = window.NeuroVision || {});

  const STATE = {
    active: false,
    settings: null,
    hiddenFlashing: [],
    hiddenDecorative: [],
    styleElement: null,
  };

  // ─── Sensory Dial ──────────────────────────────────────────────────────────
  // The "Sensory Dial" maps a single 0-100 value to all sensory parameters.
  // This gives users a single intuitive control without needing expertise.
  function sensorDialToParams(dialValue) {
    // dialValue: 0 = maximum reduction, 100 = no reduction
    const reduction = 1 - dialValue / 100; // 0 = none, 1 = maximum reduction

    return {
      saturation: Math.round(100 - reduction * 70),   // 30% to 100%
      brightness: Math.round(95 - reduction * 15),     // 80% to 95%
      animSpeed: reduction > 0.5 ? "0.001s" : "0.3s", // Stop or slow
      blur: 0,                                          // Reserved
      contrast: Math.round(100 - reduction * 20),      // 80% to 100%
    };
  }

  // ─── Color / Sensory Filtering ────────────────────────────────────────────
  function applySensoryFilter(settings) {
    const dial = settings.sensorDial ?? 50;
    const params = sensorDialToParams(dial);

    const satPct = settings.reduceSaturation
      ? (settings.saturationLevel ?? params.saturation)
      : 100;

    const contrastPct = settings.softContrast ? params.contrast : 100;

    const filterVal = `saturate(${satPct}%) brightness(${params.brightness}%) contrast(${contrastPct}%)`;

    // Apply via CSS on html element (body filter can cause stacking context issues)
    const styleEl = getOrCreateStyle("nv-autism-sensory");
    styleEl.textContent = `
      html.nv-autism-mode {
        filter: ${filterVal};
      }
      /* Preserve filter within NV UI elements */
      #nv-reading-badge,
      #nv-popup-frame {
        filter: ${invertFilter(filterVal)};
      }
    `;
  }

  function invertFilter(filterStr) {
    // Counter-filter for UI elements to restore normal appearance
    // Extract saturation value and invert
    const satMatch = filterStr.match(/saturate\((\d+)%\)/);
    if (!satMatch) return "";
    const sat = parseInt(satMatch[1]);
    const inverseSat = sat > 0 ? Math.round(10000 / sat) : 100;
    return `saturate(${inverseSat}%)`;
  }

  // ─── Animation Suppression ────────────────────────────────────────────────
  function suppressAnimations() {
    // 1. Freeze all CSS animations and transitions
    const styleEl = getOrCreateStyle("nv-autism-no-anim");
    styleEl.textContent = `
      *:not(#nv-transform-loading):not(#nv-transform-loading *),
      *::before, *::after {
        animation: none !important;
        animation-duration: 0.001s !important;
        transition: none !important;
        transition-duration: 0.001s !important;
        scroll-behavior: auto !important;
      }
      /* Keep reader mode progress bar transition */
      #nv-reader-overlay .nv-rm-progress-fill {
        transition: width 0.12s !important;
      }
    `;

    // 2. Pause video and audio
    document.querySelectorAll("video, audio").forEach((media) => {
      media.pause();
      media.autoplay = false;
    });

    // 3. Freeze GIF images — CSS has zero effect on GIFs (image-level animation)
    //    Draw current frame to canvas and replace src with a frozen PNG snapshot.
    document.querySelectorAll("img").forEach((img) => {
      if (img.__nvAutismGifFrozen) return;
      const src = img.currentSrc || img.src || "";
      if (!src || !/\.gif(\?|$)/i.test(src)) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width  = img.naturalWidth  || img.width  || 1;
        canvas.height = img.naturalHeight || img.height || 1;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        img.__nvAutismGifFrozen = true;
        img.__nvAutismOrigSrc   = img.src;
        img.src = canvas.toDataURL("image/png");
      } catch {
        // Cross-origin GIF — hide it instead
        img.__nvAutismGifFrozen  = true;
        img.__nvAutismGifHidden  = true;
        img.__nvAutismOrigSrc    = img.src;
        img.__nvAutismOrigDisplay = img.style.display;
        img.style.setProperty("display", "none", "important");
      }
    });
  }

  function restoreAnimations() {
    document.getElementById("nv-autism-no-anim")?.remove();

    // Restore frozen GIFs
    document.querySelectorAll("img").forEach((img) => {
      if (!img.__nvAutismGifFrozen) return;
      if (img.__nvAutismOrigSrc) img.src = img.__nvAutismOrigSrc;
      if (img.__nvAutismGifHidden) {
        img.style.display = img.__nvAutismOrigDisplay || "";
        delete img.__nvAutismGifHidden;
        delete img.__nvAutismOrigDisplay;
      }
      delete img.__nvAutismGifFrozen;
      delete img.__nvAutismOrigSrc;
    });
  }

  // ─── Flashing Content ─────────────────────────────────────────────────────
  function hideFlashingElements() {
    const flashing = NV.domAnalyzer.findFlashingElements();
    flashing.forEach((el) => {
      if (el.__nvFlashHidden) return;
      el.__nvFlashHidden = true;
      el.__nvFlashDisplay = el.style.display;
      el.style.setProperty("display", "none", "important");
      STATE.hiddenFlashing.push(el);
    });
  }

  function restoreFlashingElements() {
    STATE.hiddenFlashing.forEach((el) => {
      el.style.display = el.__nvFlashDisplay || "";
      delete el.__nvFlashHidden;
      delete el.__nvFlashDisplay;
    });
    STATE.hiddenFlashing = [];
  }

  // ─── Decorative Image Hiding ──────────────────────────────────────────────
  function hideDecorativeImages() {
    const { decorativeImages } = NV.domAnalyzer.analyzePage();
    decorativeImages.forEach((el) => {
      if (el.__nvDecorHidden) return;
      el.__nvDecorHidden = true;
      el.__nvDecorDisplay = el.style.display;
      el.style.setProperty("display", "none", "important");
      STATE.hiddenDecorative.push(el);
    });

    // Hide background images and reader mode media via CSS
    const styleEl = getOrCreateStyle("nv-autism-no-bg");
    styleEl.textContent = `
      html.nv-autism-mode [style*="background-image"],
      html.nv-autism-mode [class*="bg-"] {
        background-image: none !important;
      }
      /* Hide all images and videos inside the reader overlay */
      html.nv-autism-mode #nv-reader-overlay .nv-rm-figure,
      html.nv-autism-mode #nv-reader-overlay .nv-rm-img,
      html.nv-autism-mode #nv-reader-overlay .nv-rm-video-wrap {
        display: none !important;
      }
    `;
  }

  function restoreDecorativeImages() {
    STATE.hiddenDecorative.forEach((el) => {
      el.style.display = el.__nvDecorDisplay || "";
      delete el.__nvDecorHidden;
      delete el.__nvDecorDisplay;
    });
    STATE.hiddenDecorative = [];
    document.getElementById("nv-autism-no-bg")?.remove();
  }

  // ─── Consistent Spacing ───────────────────────────────────────────────────
  function applyConsistentSpacing() {
    const styleEl = getOrCreateStyle("nv-autism-spacing");
    styleEl.textContent = `
      html.nv-autism-mode * {
        margin-top: revert;
        margin-bottom: revert;
      }
      html.nv-autism-mode p,
      html.nv-autism-mode li {
        margin-bottom: 1em !important;
        line-height: 1.7 !important;
      }
      html.nv-autism-mode h1, html.nv-autism-mode h2,
      html.nv-autism-mode h3, html.nv-autism-mode h4 {
        margin-top: 1.5em !important;
        margin-bottom: 0.75em !important;
      }
      /* Remove unpredictable sticky/fixed non-nav elements */
      html.nv-autism-mode [style*="position: fixed"],
      html.nv-autism-mode [style*="position:fixed"] {
        position: static !important;
      }
    `;
  }

  function removeConsistentSpacing() {
    document.getElementById("nv-autism-spacing")?.remove();
  }

  // ─── Soft Contrast ────────────────────────────────────────────────────────
  // Already handled via sensory filter. Provides additional background softening.
  function applySoftContrast() {
    const styleEl = getOrCreateStyle("nv-autism-soft-contrast");
    styleEl.textContent = `
      html.nv-autism-mode body {
        background-color: #F5F0EB !important;
        color: #2D2D2D !important;
      }
      html.nv-autism-mode a {
        color: #4A6FA5 !important;
      }
      html.nv-autism-mode a:visited {
        color: #7A5FA5 !important;
      }
    `;
  }

  function removeSoftContrast() {
    document.getElementById("nv-autism-soft-contrast")?.remove();
  }

  // ─── AI Idiom & Figurative Language Decoder ──────────────────────────────
  // Research: Happé (1993), Kalandadze (2019) — autistic individuals consistently
  // struggle with figurative language. LLM scans page text, finds idioms/metaphors,
  // wraps them with underlined spans + click-to-reveal plain-English tooltip.

  let _tooltipEl = null;
  const _idiomMap = new Map(); // phrase (lowercase) → meaning

  function _getOrCreateTooltip() {
    if (_tooltipEl) return _tooltipEl;
    _tooltipEl = document.createElement("div");
    _tooltipEl.id = "nv-autism-tooltip";
    _tooltipEl.setAttribute("role", "tooltip");
    _tooltipEl.setAttribute("aria-live", "polite");
    document.body.appendChild(_tooltipEl);
    return _tooltipEl;
  }

  function _wrapIdiomInDOM(phrase, meaning) {
    // Walk all text nodes in the page, find the phrase, wrap in <span>
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?<![\\w])(${escaped})(?![\\w])`, "gi");

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const tag = node.parentElement?.tagName?.toLowerCase() || "";
          if (["script","style","noscript","textarea","input"].includes(tag)) return NodeFilter.FILTER_REJECT;
          if (node.parentElement?.closest(".nv-idiom-span, #nv-autism-tooltip, #nv-reading-badge")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) textNodes.push(n);

    textNodes.forEach((node) => {
      if (!regex.test(node.textContent)) return;
      regex.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0;
      let m;
      while ((m = regex.exec(node.textContent)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(node.textContent.slice(last, m.index)));
        const span = document.createElement("span");
        span.className = "nv-idiom-span";
        span.textContent = m[0];
        span.dataset.meaning = meaning;
        span.title = `Literal meaning: ${meaning}`;
        span.setAttribute("tabindex", "0");
        span.setAttribute("role", "button");
        span.setAttribute("aria-label", `Figurative expression: ${m[0]}. Literal meaning: ${meaning}`);
        frag.appendChild(span);
        last = regex.lastIndex;
      }
      if (last < node.textContent.length) frag.appendChild(document.createTextNode(node.textContent.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  function _attachIdiomTooltipListeners() {
    const tip = _getOrCreateTooltip();
    let _hideTimer = null;

    document.addEventListener("mouseover", (e) => {
      const span = e.target.closest(".nv-idiom-span");
      if (!span) return;
      clearTimeout(_hideTimer);
      tip.innerHTML = `<span class="nv-tip-label">💬 Means literally:</span> ${span.dataset.meaning}`;
      const rect = span.getBoundingClientRect();
      tip.style.left = `${window.scrollX + rect.left}px`;
      tip.style.top  = `${window.scrollY + rect.top - tip.offsetHeight - 10}px`;
      tip.style.display = "block";
      // Reposition after paint so offsetHeight is real
      requestAnimationFrame(() => {
        tip.style.top = `${window.scrollY + rect.top - tip.offsetHeight - 10}px`;
      });
    });

    document.addEventListener("mouseout", (e) => {
      if (e.target.closest(".nv-idiom-span")) {
        _hideTimer = setTimeout(() => { tip.style.display = "none"; }, 200);
      }
    });

    document.addEventListener("click", (e) => {
      const span = e.target.closest(".nv-idiom-span");
      if (span) {
        tip.innerHTML = `<span class="nv-tip-label">💬 Means literally:</span> ${span.dataset.meaning}`;
        tip.style.display = "block";
        setTimeout(() => { tip.style.display = "none"; }, 4000);
      } else if (!e.target.closest("#nv-autism-tooltip")) {
        tip.style.display = "none";
      }
    });
  }

  async function enableIdiomDecoder() {
    if (document.getElementById("nv-autism-tooltip")) return; // already running
    _getOrCreateTooltip();
    _attachIdiomTooltipListeners();

    // Inject styles for idiom spans
    const styleEl = getOrCreateStyle("nv-autism-idiom-styles");
    styleEl.textContent = `
      .nv-idiom-span {
        border-bottom: 2px dashed #7C3AED;
        cursor: help;
        color: inherit;
        background: rgba(124,58,237,0.07);
        border-radius: 2px;
        padding: 0 1px;
      }
      .nv-idiom-span:hover, .nv-idiom-span:focus {
        background: rgba(124,58,237,0.18);
        outline: none;
      }
      #nv-autism-tooltip {
        position: absolute;
        z-index: 2147483640;
        display: none;
        max-width: 280px;
        background: #1E1B4B;
        color: #E0E7FF;
        font-size: 13px;
        line-height: 1.5;
        padding: 8px 12px;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.35);
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .nv-tip-label {
        display: block;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #A5B4FC;
        margin-bottom: 2px;
      }
    `;

    // Call LLM to find idioms on this page
    const pageText = (NV.contentState?.metrics?.mainText || document.body.innerText || "").slice(0, 3000);
    if (!pageText.trim()) return;

    try {
      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "NV_DETECT_IDIOMS", payload: { text: pageText } }, resolve);
      });
      if (!resp?.success || !Array.isArray(resp.data)) return;
      resp.data.forEach(({ phrase, meaning }) => {
        if (!phrase || !meaning) return;
        const key = phrase.toLowerCase().trim();
        if (_idiomMap.has(key)) return;
        _idiomMap.set(key, meaning);
        _wrapIdiomInDOM(phrase.trim(), meaning);
      });
    } catch (err) {
      console.warn("[NV] Idiom decoder failed:", err?.message || err);
      // Possible causes: API key not set, wrong model name, network error.
      // Open DevTools → Background Service Worker console for full details.
    }
  }

  function disableIdiomDecoder() {
    // Unwrap all nv-idiom-span elements
    document.querySelectorAll(".nv-idiom-span").forEach((span) => {
      span.replaceWith(document.createTextNode(span.textContent));
    });
    _tooltipEl?.remove();
    _tooltipEl = null;
    _idiomMap.clear();
    document.getElementById("nv-autism-idiom-styles")?.remove();
  }

  // ─── Emotion / Tone Indicator ─────────────────────────────────────────────
  // Research: autistic users frequently miss implied tone — sarcasm, urgency,
  // opinion. Small inline badges make intent explicit without requiring inference.

  const TONE_CONFIG = {
    informative: { emoji: "ℹ️", label: "Informative", color: "#1D4ED8", bg: "#DBEAFE" },
    warning:     { emoji: "⚠️", label: "Warning",     color: "#92400E", bg: "#FEF3C7" },
    opinion:     { emoji: "💭", label: "Opinion",     color: "#065F46", bg: "#D1FAE5" },
    sarcastic:   { emoji: "😏", label: "Sarcastic",   color: "#6B21A8", bg: "#F3E8FF" },
    emotional:   { emoji: "❤️", label: "Emotional",   color: "#9F1239", bg: "#FFE4E6" },
    question:    { emoji: "❓", label: "Question",    color: "#164E63", bg: "#CFFAFE" },
  };

  async function enableToneIndicators() {
    if (document.querySelector(".nv-tone-badge")) return; // already applied

    const styleEl = getOrCreateStyle("nv-autism-tone-styles");
    styleEl.textContent = `
      .nv-tone-badge {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 1px 7px 1px 5px;
        border-radius: 20px;
        margin-right: 7px;
        vertical-align: middle;
        white-space: nowrap;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: default;
        user-select: none;
        flex-shrink: 0;
      }
    `;

    const root = NV.pageTransformer?.isActive()
      ? document.getElementById("nv-reader-overlay")
      : NV.readabilityScorer?.extractMainContent()?.element;
    if (!root) return;

    const paras = Array.from(root.querySelectorAll("p")).filter(
      (p) => (p.innerText || "").split(/\s+/).length > 12
    );
    if (!paras.length) return;

    // Process in batches of 6 to keep prompt size reasonable
    const BATCH = 6;
    for (let i = 0; i < paras.length; i += BATCH) {
      const batch = paras.slice(i, i + BATCH);
      const texts = batch.map((p) => (p.innerText || "").trim());

      try {
        const resp = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "NV_DETECT_TONE", payload: { paragraphs: texts } }, resolve);
        });
        if (!resp?.success || !Array.isArray(resp.data)) continue;

        resp.data.forEach((item, j) => {
          const tone = (item?.tone || "").toLowerCase();
          const cfg = TONE_CONFIG[tone];
          if (!cfg) return;
          const para = batch[j];
          if (!para || para.querySelector(".nv-tone-badge")) return;

          const badge = document.createElement("span");
          badge.className = "nv-tone-badge";
          badge.setAttribute("aria-label", `Paragraph tone: ${cfg.label}`);
          badge.title = `This paragraph is ${cfg.label.toLowerCase()}`;
          badge.style.color = cfg.color;
          badge.style.background = cfg.bg;
          badge.innerHTML = `${cfg.emoji} ${cfg.label}`;
          para.prepend(badge);
        });
      } catch { /* LLM unavailable — skip batch */ }
    }
  }

  function disableToneIndicators() {
    document.querySelectorAll(".nv-tone-badge").forEach((b) => b.remove());
    document.getElementById("nv-autism-tone-styles")?.remove();
  }

  // ─── Helper: get or create style element ──────────────────────────────────
  function getOrCreateStyle(id) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }
    return el;
  }

  // ─── Activate / Deactivate ────────────────────────────────────────────────
  async function activate(settings) {
    if (STATE.active) return;
    STATE.active = true;
    STATE.settings = settings;

    document.documentElement.classList.add("nv-autism-mode");

    applySensoryFilter(settings);

    if (settings.removeAnimations) suppressAnimations();
    if (settings.hideDecorativeImages) hideDecorativeImages();
    if (settings.consistentSpacing) applyConsistentSpacing();
    if (settings.softContrast) applySoftContrast();
    if (settings.idiomDecoder !== false) enableIdiomDecoder();
    if (settings.toneIndicators) enableToneIndicators();
  }

  async function deactivate() {
    if (!STATE.active) return;
    STATE.active = false;

    document.documentElement.classList.remove("nv-autism-mode");

    // Remove all autism style elements
    [
      "nv-autism-sensory",
      "nv-autism-no-anim",
      "nv-autism-no-bg",
      "nv-autism-spacing",
      "nv-autism-soft-contrast",
    ].forEach((id) => document.getElementById(id)?.remove());

    restoreAnimations();
    restoreDecorativeImages();
    removeConsistentSpacing();
    removeSoftContrast();
    disableIdiomDecoder();
    disableToneIndicators();
  }

  function updateSetting(key, value) {
    if (!STATE.settings) return;
    STATE.settings[key] = value;

    switch (key) {
      case "reduceSaturation":
      case "saturationLevel":
      case "softContrast":
      case "sensorDial":
        applySensoryFilter(STATE.settings);
        if (value && key === "softContrast") applySoftContrast();
        if (!value && key === "softContrast") removeSoftContrast();
        break;
      case "removeAnimations":
        value ? suppressAnimations() : restoreAnimations();
        break;
      case "hideDecorativeImages":
        value ? hideDecorativeImages() : restoreDecorativeImages();
        break;
      case "consistentSpacing":
        value ? applyConsistentSpacing() : removeConsistentSpacing();
        break;
      case "idiomDecoder":
        value ? enableIdiomDecoder() : disableIdiomDecoder();
        break;
      case "toneIndicators":
        value ? enableToneIndicators() : disableToneIndicators();
        break;
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  NV.autism = {
    activate,
    deactivate,
    updateSetting,
    sensorDialToParams,
    isActive: () => STATE.active,
  };
})();
