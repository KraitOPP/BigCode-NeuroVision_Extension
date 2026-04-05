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
    removedElements: [], // { el, display } for restoration
    stopWatcher: null,
    keywords: [],
    settings: null,
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

    // Also target iframes (ads)
    document.querySelectorAll("iframe").forEach((el) => {
      const src = el.src || "";
      if (/doubleclick|adsystem|googlesyndication|adservice/i.test(src)) {
        el.__nvHidden = true;
        el.__nvOrigDisplay = el.style.display;
        el.style.setProperty("display", "none", "important");
        STATE.removedElements.push(el);
      }
    });
  }

  function restoreDistractions() {
    STATE.removedElements.forEach((el) => {
      el.style.display = el.__nvOrigDisplay || "";
      delete el.__nvHidden;
      delete el.__nvOrigDisplay;
    });
    STATE.removedElements = [];
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

  function restoreAnimations() {
    document.getElementById("nv-adhd-no-animation")?.remove();
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
