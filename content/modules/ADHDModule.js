/**
 * NeuroVision — ADHD Module
 *
 * Features:
 * - Distraction removal (ads, sidebars, pop-ups)
 * - Reading ruler (horizontal guide line)
 * - Focus Tunnel (vignette around active paragraph)
 * - Content chunking with visual dividers
 * - Keyword highlighting (LLM-assisted)
 * - Reading time badge
 * - Animation removal
 * - DOM mutation watching for new distractions
 */
(function () {
  "use strict";

  const NV = (window.NeuroVision = window.NeuroVision || {});

  const STATE = {
    active: false,
    ruler: null,
    focusTunnel: null,
    badge: null,
    removedElements: [],
    stopWatcher: null,
    keywords: [],
    settings: null,
    _hoverBlockActive: false,
  };

  // ─── Distraction Removal ──────────────────────────────────────────────────
  function removeDistractions(settings) {
    // Reader mode has no ads or distractions — skip entirely
    if (NV.pageTransformer?.isActive()) return;

    const { distractions, overlays } = NV.domAnalyzer.analyzePage();

    [...distractions, ...overlays].forEach((el) => {
      if (el.__nvHidden) return;
      el.__nvHidden = true;
      el.__nvOrigDisplay = el.style.display;
      el.style.setProperty("display", "none", "important");
      STATE.removedElements.push(el);
    });

    // Also target ad iframes
    document.querySelectorAll("iframe").forEach((el) => {
      const src = el.src || "";
      if (/doubleclick|adsystem|googlesyndication|adservice/i.test(src)) {
        el.__nvHidden = true;
        el.__nvOrigDisplay = el.style.display;
        el.style.setProperty("display", "none", "important");
        STATE.removedElements.push(el);
      }
    });

    // Block hover popups — intercept mouseenter/mouseover on elements that
    // are likely to trigger popups (tooltips, preview cards, image overlays).
    // We stop propagation on the event so the site's listener never fires.
    _blockHoverPopups();
  }

  // ─── Hover Popup Blocker ──────────────────────────────────────────────────
  // Two-pronged approach:
  //  1. CSS — hides known popup containers the moment they appear/become visible
  //  2. Event capture — stops mouseenter/mouseover on popup-triggering elements
  //     before site listeners fire (handles JS-driven popups CSS can't catch)
  //  3. MutationObserver — catches popups that are injected into DOM on hover
  //     and immediately hides them (covers Wikipedia, MDN, GitHub, etc.)

  // CSS class/id patterns that identify hover-triggered popups
  const HOVER_POPUP_PATTERNS = /\b(tooltip|popover|preview|hover-card|hovercard|hover-popup|tippy|dropdown|flyout|float|peek|card-hover|wiki-tooltip|ref-popup|footnote-popup|citation-popup|image-hover|gallery-hover|img-popup|definition|defn-popup|mwe-popups|mw-tooltip|ext-discussiontools|reference-preview|page-preview|link-preview|popup-trigger|content-preview)\b/i;

  // CSS rule that hides ALL known popup patterns immediately — covers cases
  // where stopPropagation is too late (element-level listeners, shadow DOM, etc.)
  const HOVER_POPUP_CSS = `
    /* Wikipedia page previews */
    .mwe-popups, .mwe-popups-container,
    /* Wikipedia reference tooltips */
    .mw-tooltip, .ext-discussiontools-init-replylink-buttons,
    /* Generic tooltip/popover patterns */
    [class*="tooltip"]:not([class*="nv-"]),
    [class*="popover"]:not([class*="nv-"]),
    [class*="preview"]:not([class*="nv-"]):not(img),
    [class*="hover-card"]:not([class*="nv-"]),
    [class*="hovercard"]:not([class*="nv-"]),
    [class*="tippy"]:not([class*="nv-"]),
    [id*="tooltip"]:not([id^="nv-"]),
    [id*="popover"]:not([id^="nv-"]),
    [id*="preview"]:not([id^="nv-"]),
    /* Role-based */
    [role="tooltip"]:not([id^="nv-"]),
    /* Link preview cards (hover images + paragraphs) */
    .link-preview, .page-preview, .content-preview,
    .popup, .tippy-box, .tippy-content,
    .v-tooltip, .b-tooltip, .el-tooltip__popper,
    /* MDN, GitHub, Stack Overflow hover cards */
    .question-hyperlink-popup, .s-popover,
    .Popover, .Popover-message,
    [data-tippy-content],
    .ghd-tooltip {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;

  function _hoverBlockListener(e) {
    const el = e.target;
    if (!el || el.nodeType !== 1) return;
    if (NV.domAnalyzer.isNvOwnElement(el)) return;

    // Walk up to 4 ancestor levels checking for popup-trigger signals
    let node = el;
    for (let i = 0; i < 4; i++) {
      if (!node || node === document.body) break;
      const cls  = (typeof node.className === "string" ? node.className : node.className?.toString?.() || "");
      const id   = node.id || "";
      const role = node.getAttribute?.("role") || "";
      const aria = node.getAttribute?.("aria-haspopup") || "";
      if (
        HOVER_POPUP_PATTERNS.test(cls) ||
        HOVER_POPUP_PATTERNS.test(id) ||
        role === "tooltip" ||
        aria === "true" || aria === "dialog"
      ) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      node = node.parentElement;
    }
  }

  let _hoverPopupObserver = null;

  function _hideIfPopup(node) {
    if (node.nodeType !== 1) return;
    if (NV.domAnalyzer.isNvOwnElement(node)) return;
    const cls  = (typeof node.className === "string" ? node.className : node.className?.toString?.() || "");
    const id   = node.id || "";
    const role = node.getAttribute?.("role") || "";
    if (
      HOVER_POPUP_PATTERNS.test(cls) ||
      HOVER_POPUP_PATTERNS.test(id) ||
      role === "tooltip"
    ) {
      node.style.setProperty("display",    "none",   "important");
      node.style.setProperty("visibility", "hidden", "important");
      node.style.setProperty("opacity",    "0",      "important");
      node.style.setProperty("pointer-events", "none", "important");
    }
  }

  function _startHoverPopupObserver() {
    if (_hoverPopupObserver) return;
    _hoverPopupObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Handle newly inserted nodes
        for (const node of mutation.addedNodes) {
          _hideIfPopup(node);
          // Also check children of inserted containers
          if (node.nodeType === 1) {
            node.querySelectorAll?.("*").forEach?.(_hideIfPopup);
          }
        }
        // Handle attribute changes (class/style) on existing nodes —
        // Wikipedia pre-inserts .mwe-popups and shows it via class change
        if (mutation.type === "attributes" && mutation.target) {
          _hideIfPopup(mutation.target);
        }
      }
    });
    _hoverPopupObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-hidden"],
    });
  }

  function _stopHoverPopupObserver() {
    if (_hoverPopupObserver) {
      _hoverPopupObserver.disconnect();
      _hoverPopupObserver = null;
    }
  }

  function _blockHoverPopups() {
    if (STATE._hoverBlockActive) return;
    STATE._hoverBlockActive = true;

    // 1. Inject CSS to hide known popup containers instantly
    const style = document.createElement("style");
    style.id = "nv-adhd-no-hover-popups";
    style.textContent = HOVER_POPUP_CSS;
    document.head.appendChild(style);

    // 2. Capture-phase event blocking
    document.addEventListener("mouseenter", _hoverBlockListener, true);
    document.addEventListener("mouseover",  _hoverBlockListener, true);
    // Also intercept focus events (keyboard users can trigger tooltips)
    document.addEventListener("focusin",    _hoverBlockListener, true);

    // 3. Scan existing DOM for pre-inserted popup elements (Wikipedia
    //    injects .mwe-popups at page load and shows it via class changes)
    document.querySelectorAll(
      '.mwe-popups, .mwe-popups-container, [class*="tooltip"], [class*="popover"], [class*="preview"]:not(img), [role="tooltip"]'
    ).forEach((el) => {
      if (NV.domAnalyzer.isNvOwnElement(el)) return;
      el.style.setProperty("display",    "none",   "important");
      el.style.setProperty("visibility", "hidden", "important");
      el.style.setProperty("opacity",    "0",      "important");
      el.style.setProperty("pointer-events", "none", "important");
    });

    // 4. MutationObserver for dynamically injected/modified popups (Wikipedia, etc.)
    _startHoverPopupObserver();
  }

  function _unblockHoverPopups() {
    if (!STATE._hoverBlockActive) return;
    STATE._hoverBlockActive = false;
    document.getElementById("nv-adhd-no-hover-popups")?.remove();
    document.removeEventListener("mouseenter", _hoverBlockListener, true);
    document.removeEventListener("mouseover",  _hoverBlockListener, true);
    document.removeEventListener("focusin",    _hoverBlockListener, true);
    _stopHoverPopupObserver();
  }

  function restoreDistractions() {
    STATE.removedElements.forEach((el) => {
      el.style.display = el.__nvOrigDisplay || "";
      delete el.__nvHidden;
      delete el.__nvOrigDisplay;
    });
    STATE.removedElements = [];
    _unblockHoverPopups();
  }

  // ─── Reading Ruler ────────────────────────────────────────────────────────
  function createReadingRuler() {
    const ruler = document.createElement("div");
    ruler.id = "nv-reading-ruler";
    ruler.setAttribute("aria-hidden", "true");
    document.body.appendChild(ruler);
    STATE.ruler = ruler;

    const onMove = (e) => {
      ruler.style.top = `${e.clientY - 21}px`; // centred on cursor within 42px band
    };

    document.addEventListener("mousemove", onMove);
    STATE._rulerListener = onMove;
    return ruler;
  }

  function removeReadingRuler() {
    if (STATE.ruler) {
      STATE.ruler.remove();
      STATE.ruler = null;
    }
    if (STATE._rulerListener) {
      document.removeEventListener("mousemove", STATE._rulerListener);
      STATE._rulerListener = null;
    }
  }

  // ─── Focus Tunnel (Vignette effect) ───────────────────────────────────────
  // Creates a radial shadow that dims everything around the cursor area
  function createFocusTunnel() {
    const tunnel = document.createElement("div");
    tunnel.id = "nv-focus-tunnel";
    tunnel.setAttribute("aria-hidden", "true");
    document.body.appendChild(tunnel);
    STATE.focusTunnel = tunnel;

    const onMove = (e) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      tunnel.style.background = `radial-gradient(
        ellipse 350px 200px at ${x}% ${y}%,
        transparent 0%,
        rgba(0,0,0,0.55) 100%
      )`;
    };

    document.addEventListener("mousemove", onMove);
    STATE._tunnelListener = onMove;

    // Paragraph focus on click
    const onClick = (e) => {
      document.querySelectorAll(".nv-focused-para").forEach((el) =>
        el.classList.remove("nv-focused-para")
      );
      const para = e.target.closest("p, li, blockquote, h1, h2, h3, h4");
      if (para) para.classList.add("nv-focused-para");
    };

    document.addEventListener("click", onClick);
    STATE._tunnelClickListener = onClick;
  }

  function removeFocusTunnel() {
    if (STATE.focusTunnel) {
      STATE.focusTunnel.remove();
      STATE.focusTunnel = null;
    }
    if (STATE._tunnelListener) {
      document.removeEventListener("mousemove", STATE._tunnelListener);
      STATE._tunnelListener = null;
    }
    if (STATE._tunnelClickListener) {
      document.removeEventListener("click", STATE._tunnelClickListener);
      STATE._tunnelClickListener = null;
    }
    document.querySelectorAll(".nv-focused-para").forEach((el) =>
      el.classList.remove("nv-focused-para")
    );
  }

  // ─── Content Chunking ─────────────────────────────────────────────────────
  function applyContentChunking() {
    // Reader mode already structures content into typed sections — skip
    if (NV.pageTransformer?.isActive()) return;

    const { element: mainEl } = NV.readabilityScorer.extractMainContent();
    if (!mainEl) return;

    let chunkCount = 0;
    const paras = mainEl.querySelectorAll("p");

    paras.forEach((para, i) => {
      const words = (para.innerText || "").split(/\s+/).filter(Boolean).length;
      // Add a chunk divider every ~4 paragraphs or after long paragraphs
      if (i > 0 && (i % 4 === 0 || words > 120)) {
        if (!para.previousElementSibling?.classList.contains("nv-chunk-break")) {
          const divider = document.createElement("div");
          divider.className = "nv-chunk-break";
          divider.setAttribute("aria-hidden", "true");
          divider.innerHTML = `<span class="nv-chunk-label">§ Section ${++chunkCount}</span>`;
          para.parentNode.insertBefore(divider, para);
        }
      }
    });
  }

  function removeContentChunking() {
    document.querySelectorAll(".nv-chunk-break").forEach((el) => el.remove());
  }

  // ─── Stop Animations ──────────────────────────────────────────────────────
  function stopAnimations() {
    // 1. Freeze CSS animations and transitions
    if (!document.getElementById("nv-adhd-no-animation")) {
      const style = document.createElement("style");
      style.id = "nv-adhd-no-animation";
      style.textContent = `
        *, *::before, *::after {
          animation-duration: 0.001s !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.001s !important;
        }
      `;
      document.head.appendChild(style);
    }

    // 2. Freeze GIF images — CSS cannot stop GIFs; must replace src with
    //    a canvas snapshot of the current frame.
    document.querySelectorAll("img").forEach((img) => {
      if (img.__nvGifFrozen) return;
      const src = img.currentSrc || img.src || "";
      if (!src || !/\.gif(\?|$)/i.test(src)) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width  = img.naturalWidth  || img.width  || 1;
        canvas.height = img.naturalHeight || img.height || 1;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const frozen = canvas.toDataURL("image/png");
        img.__nvGifFrozen = true;
        img.__nvOrigSrc   = img.src;
        img.src = frozen;
      } catch {
        // Cross-origin GIF — cannot draw to canvas; hide it instead
        img.__nvGifFrozen  = true;
        img.__nvGifHidden  = true;
        img.__nvOrigSrc    = img.src;
        img.__nvOrigDisplay = img.style.display;
        img.style.setProperty("display", "none", "important");
      }
    });
  }

  function restoreAnimations() {
    document.getElementById("nv-adhd-no-animation")?.remove();

    // Restore frozen GIFs
    document.querySelectorAll("img").forEach((img) => {
      if (!img.__nvGifFrozen) return;
      if (img.__nvOrigSrc) img.src = img.__nvOrigSrc;
      if (img.__nvGifHidden) {
        img.style.display = img.__nvOrigDisplay || "";
        delete img.__nvGifHidden;
        delete img.__nvOrigDisplay;
      }
      delete img.__nvGifFrozen;
      delete img.__nvOrigSrc;
    });
  }

  // ─── Reading Time Badge ───────────────────────────────────────────────────
  function showReadingTimeBadge(metrics) {
    if (STATE.badge) STATE.badge.remove();

    const badge = document.createElement("div");
    badge.id = "nv-reading-badge";
    badge.setAttribute("aria-live", "polite");
    badge.setAttribute("aria-label", `Estimated reading time`);

    const clInfo = NV.readabilityScorer.cognitiveLoadLabel(metrics.cognitiveLoad);
    const gradeInfo = NV.readabilityScorer.gradeToLabel(metrics.readingGrade);

    badge.innerHTML = `
      <div class="nv-badge-row">
        <span class="nv-badge-icon">📖</span>
        <span class="nv-badge-time">${metrics.readingTime} read</span>
      </div>
      <div class="nv-badge-row">
        <span class="nv-badge-label" style="color:${gradeInfo.color}">
          Grade ${metrics.readingGrade} · ${gradeInfo.label}
        </span>
      </div>
      <div class="nv-badge-row">
        <span class="nv-badge-label">
          Cognitive Load:
          <span style="color:${clInfo.color};font-weight:600">
            ${metrics.cognitiveLoad}/100 (${clInfo.label})
          </span>
        </span>
      </div>
    `;

    document.body.appendChild(badge);
    STATE.badge = badge;
  }

  function hideBadge() {
    STATE.badge?.remove();
    STATE.badge = null;
  }

  // ─── Keyword Highlighting ─────────────────────────────────────────────────
  function highlightKeywords(keywords) {
    STATE.keywords = keywords;
    if (!keywords.length) return;

    // Remove old highlights first
    removeKeywordHighlights();

    // In reader mode target the reader overlay; otherwise use main content
    let searchRoot;
    if (NV.pageTransformer?.isActive()) {
      searchRoot = document.getElementById("nv-reader-overlay");
    } else {
      const { element: mainEl } = NV.readabilityScorer.extractMainContent();
      searchRoot = mainEl;
    }
    if (!searchRoot) return;

    const textNodes = [];
    const walker = document.createTreeWalker(
      searchRoot,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest(".nv-keyword")) continue;
      textNodes.push(node);
    }

    const escaped = keywords.map((k) =>
      k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );
    const regex = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");

    textNodes.forEach((node) => {
      const text = node.textContent;
      if (!regex.test(text)) return;
      regex.lastIndex = 0;

      const frag = document.createDocumentFragment();
      let last = 0;
      let match;

      while ((match = regex.exec(text)) !== null) {
        if (match.index > last) {
          frag.appendChild(document.createTextNode(text.slice(last, match.index)));
        }
        const mark = document.createElement("mark");
        mark.className = "nv-keyword";
        mark.textContent = match[0];
        mark.title = "Key concept";
        frag.appendChild(mark);
        last = regex.lastIndex;
      }

      if (last < text.length) {
        frag.appendChild(document.createTextNode(text.slice(last)));
      }

      node.parentNode.replaceChild(frag, node);
    });
  }

  function removeKeywordHighlights() {
    document.querySelectorAll("mark.nv-keyword").forEach((mark) => {
      const parent = mark.parentNode;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    });
    STATE.keywords = [];
  }

  // ─── Activate / Deactivate ────────────────────────────────────────────────
  async function activate(settings, metrics) {
    if (STATE.active) return;
    STATE.active = true;
    STATE.settings = settings;

    document.body.classList.add("nv-adhd-mode");

    const readerActive = NV.pageTransformer?.isActive();

    // These features operate on original page DOM — skip in reader mode
    if (settings.removeAds && !readerActive) removeDistractions(settings);
    if (settings.contentChunking && !readerActive) applyContentChunking();

    // These work regardless of reader mode
    if (settings.removeAnimations) stopAnimations();
    if (settings.readingRuler) createReadingRuler();
    if (settings.focusTunnel) createFocusTunnel();
    if (settings.showReadingTime && metrics) showReadingTimeBadge(metrics);

    // Only watch for new ads/overlays on the original page
    if (!readerActive) {
      STATE.stopWatcher = NV.domAnalyzer.watchForNewOverlays((newEl) => {
        if (settings.removeAds && !NV.pageTransformer?.isActive()) {
          newEl.style.setProperty("display", "none", "important");
          STATE.removedElements.push(newEl);
        }
      });
    }
  }

  async function deactivate() {
    if (!STATE.active) return;
    STATE.active = false;

    document.body.classList.remove("nv-adhd-mode");

    restoreDistractions();
    restoreAnimations();
    removeReadingRuler();
    removeFocusTunnel();
    removeContentChunking();
    removeKeywordHighlights();
    hideBadge();

    if (STATE.stopWatcher) {
      STATE.stopWatcher();
      STATE.stopWatcher = null;
    }
  }

  function updateSetting(key, value) {
    if (!STATE.settings) return;
    STATE.settings[key] = value;

    switch (key) {
      case "readingRuler":
        value ? createReadingRuler() : removeReadingRuler();
        break;
      case "focusTunnel":
        value ? createFocusTunnel() : removeFocusTunnel();
        break;
      case "removeAds":
        value ? removeDistractions(STATE.settings) : restoreDistractions();
        break;
      case "removeAnimations":
        value ? stopAnimations() : restoreAnimations();
        break;
      case "contentChunking":
        value ? applyContentChunking() : removeContentChunking();
        break;
      case "highlightKeywords":
        if (!value) {
          removeKeywordHighlights();
        } else {
          // Fetch keywords via LLM then highlight them on the page
          const text = (NV.contentState?.metrics?.mainText || "").slice(0, 2000);
          if (!text) break;
          NV.ollama.extractKeywords(text)
            .then((keywords) => {
              if (keywords && keywords.length) highlightKeywords(keywords);
            })
            .catch(() => { /* LLM unavailable — silently skip */ });
        }
        break;
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  NV.adhd = {
    activate,
    deactivate,
    updateSetting,
    highlightKeywords,
    removeKeywordHighlights,
    showReadingTimeBadge,
    hideBadge,
    isActive: () => STATE.active,
  };
})();
