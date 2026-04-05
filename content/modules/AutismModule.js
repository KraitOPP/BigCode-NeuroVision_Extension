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

    // Also pause any video/audio autoplay
    document.querySelectorAll("video, audio").forEach((media) => {
      media.pause();
      media.autoplay = false;
    });
  }

  function restoreAnimations() {
    document.getElementById("nv-autism-no-anim")?.remove();
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

  // ─── Hover Word Tooltip (Figurative Language) ─────────────────────────────
  let _tooltipEl = null;
  let _tooltipTimeout = null;

  function enableFigurativeLanguageHelper() {
    if (_tooltipEl) return;
    _tooltipEl = document.createElement("div");
    _tooltipEl.id = "nv-autism-tooltip";
    _tooltipEl.setAttribute("role", "tooltip");
    _tooltipEl.setAttribute("aria-live", "polite");
    document.body.appendChild(_tooltipEl);

    const FIGURATIVE = {
      // Common idioms
      "hit the nail on the head": "said exactly the right thing",
      "under the weather": "feeling sick or unwell",
      "break a leg": "good luck",
      "bite the bullet": "do something difficult that you've been putting off",
      "cost an arm and a leg": "very expensive",
      "it's raining cats and dogs": "raining very heavily",
      "piece of cake": "very easy",
      "spill the beans": "accidentally tell a secret",
      "once in a blue moon": "very rarely",
      "kick the bucket": "die",
      "bite off more than you can chew": "try to do more than you can handle",
      // Additional phrases
      "burn the midnight oil": "work late into the night",
      "let the cat out of the bag": "accidentally reveal a secret",
      "the ball is in your court": "it's your turn to take action",
      "add fuel to the fire": "make a bad situation worse",
      "barking up the wrong tree": "looking in the wrong place or blaming the wrong person",
      "beat around the bush": "avoid talking about the main point",
      "bite the hand that feeds you": "hurt someone who helps you",
      "the tip of the iceberg": "a small visible part of a much bigger problem",
      "hit the sack": "go to bed",
      "jump on the bandwagon": "follow a trend others have started",
      "miss the boat": "miss an opportunity",
      "on the fence": "unable to decide",
      "pull someone's leg": "joke or tease someone",
      "under the table": "secretly and illegally",
      "twist someone's arm": "pressure someone into doing something",
      "wrap your head around": "understand something complex",
      "go back to square one": "start over from the beginning",
    };

    let _dismissTimer = null;

    document.addEventListener("mouseover", (e) => {
      const el = e.target;
      if (!el.closest("p, li, blockquote, h2, h3")) return;

      const text = (el.innerText || "").toLowerCase();
      let explanation = null;

      for (const [phrase, meaning] of Object.entries(FIGURATIVE)) {
        if (text.includes(phrase)) {
          explanation = `"${phrase}" — ${meaning}`;
          break;
        }
      }

      if (!explanation) return;

      clearTimeout(_tooltipTimeout);
      clearTimeout(_dismissTimer);
      _tooltipTimeout = setTimeout(() => {
        _tooltipEl.textContent = explanation;
        _tooltipEl.style.left = `${e.pageX + 14}px`;
        _tooltipEl.style.top  = `${e.pageY - 44}px`;
        _tooltipEl.style.display = "block";
        // Auto-dismiss after 3 s
        _dismissTimer = setTimeout(() => {
          if (_tooltipEl) _tooltipEl.style.display = "none";
        }, 3000);
      }, 500);
    });

    document.addEventListener("mouseout", () => {
      clearTimeout(_tooltipTimeout);
      if (_tooltipEl) _tooltipEl.style.display = "none";
    });
  }

  function disableFigurativeLanguageHelper() {
    _tooltipEl?.remove();
    _tooltipEl = null;
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
    if (settings.removeFlashing) hideFlashingElements();
    if (settings.hideDecorativeImages) hideDecorativeImages();
    if (settings.consistentSpacing) applyConsistentSpacing();
    if (settings.softContrast) applySoftContrast();

    enableFigurativeLanguageHelper();
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
    restoreFlashingElements();
    restoreDecorativeImages();
    removeConsistentSpacing();
    removeSoftContrast();
    disableFigurativeLanguageHelper();
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
      case "removeFlashing":
        value ? hideFlashingElements() : restoreFlashingElements();
        break;
      case "hideDecorativeImages":
        value ? hideDecorativeImages() : restoreDecorativeImages();
        break;
      case "consistentSpacing":
        value ? applyConsistentSpacing() : removeConsistentSpacing();
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
