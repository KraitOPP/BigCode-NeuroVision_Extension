/**
 * NeuroVision — Dyslexia Module
 *
 * Features:
 * - Accessibility fonts (Lexend, OpenDyslexic, Atkinson Hyperlegible)
 * - Text spacing (letter, word, line)
 * - Color overlay (reading tint)
 * - Reading ruler / line highlight
 * - Syllable Rainbow — alternating color per syllable (novel feature)
 * - Beeline Colors — per-line color gradient to guide eye return (inspired by Beeline Reader)
 * - Max line width control
 * - Word hover for simplified definition (LLM)
 */
(function () {
  "use strict";

  const NV = (window.NeuroVision = window.NeuroVision || {});

  const STATE = {
    active: false,
    settings: null,
    rulerEl: null,
    overlayEl: null,
    wordTooltipEl: null,
    syllableActive: false,
    beelineActive: false,
    originalNodes: new Map(), // textNode → original text for restoration
  };

  // ─── Font Loading ─────────────────────────────────────────────────────────
  const FONTS = {
    lexend: {
      name: "Lexend",
      url: "https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500&display=swap",
      css: "'Lexend', sans-serif",
    },
    opendyslexic: {
      name: "OpenDyslexic",
      url: null, // Bundled as web-accessible resource
      css: "'OpenDyslexic', sans-serif",
    },
    atkinson: {
      name: "Atkinson Hyperlegible",
      url: "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap",
      css: "'Atkinson Hyperlegible', sans-serif",
    },
  };

  function loadFont(fontChoice) {
    const font = FONTS[fontChoice] || FONTS.lexend;

    // Load from Google Fonts if needed
    if (font.url && !document.getElementById(`nv-font-${fontChoice}`)) {
      const link = document.createElement("link");
      link.id = `nv-font-${fontChoice}`;
      link.rel = "stylesheet";
      link.href = font.url;
      document.head.appendChild(link);
    }

    // Apply font via CSS — includes reader mode elements
    const styleEl = getOrCreateStyle("nv-dyslexia-font");
    styleEl.textContent = `
      html.nv-dyslexia-mode article p,
      html.nv-dyslexia-mode main p,
      html.nv-dyslexia-mode [role="main"] p,
      html.nv-dyslexia-mode article li,
      html.nv-dyslexia-mode main li,
      html.nv-dyslexia-mode article td,
      html.nv-dyslexia-mode main td,
      html.nv-dyslexia-mode article blockquote,
      html.nv-dyslexia-mode article h1,
      html.nv-dyslexia-mode article h2,
      html.nv-dyslexia-mode article h3,
      #nv-reader-overlay .nv-rm-para,
      #nv-reader-overlay .nv-rm-step-text,
      #nv-reader-overlay .nv-rm-sec-heading,
      #nv-reader-overlay .nv-rm-sb-summary {
        font-family: ${font.css} !important;
      }
    `;
  }

  function removeFont() {
    document.getElementById("nv-dyslexia-font")?.remove();
  }

  // ─── Text Spacing ─────────────────────────────────────────────────────────
  // Scoped to article/main content only — does NOT touch nav, header, footer,
  // or arbitrary page elements so page layout stays intact.
  function applySpacing(settings) {
    const styleEl = getOrCreateStyle("nv-dyslexia-spacing");
    // Selector targets content-level text including reader mode elements
    const sel = `
      html.nv-dyslexia-mode article p,
      html.nv-dyslexia-mode main p,
      html.nv-dyslexia-mode [role="main"] p,
      html.nv-dyslexia-mode article li,
      html.nv-dyslexia-mode main li,
      html.nv-dyslexia-mode article td,
      html.nv-dyslexia-mode main td,
      html.nv-dyslexia-mode blockquote,
      #nv-reader-overlay .nv-rm-para,
      #nv-reader-overlay .nv-rm-step-text`;
    styleEl.textContent = `
      ${sel} {
        /* Research: BDA recommends 0.12em+ letter-spacing; 0.16em word-spacing */
        letter-spacing: ${settings.letterSpacing ?? 0.12}em !important;
        word-spacing: ${settings.wordSpacing ?? 0.16}em !important;
        line-height: ${settings.lineHeight ?? 1.8} !important;
        /* Research: BDA recommends ≥16px; never go below that */
        font-size: ${Math.max(16, settings.fontSize ?? 18)}px !important;
        word-break: keep-all !important;
      }
    `;
  }

  function removeSpacing() {
    document.getElementById("nv-dyslexia-spacing")?.remove();
  }

  // ─── Color Overlay ────────────────────────────────────────────────────────
  function createOverlay(color, opacity) {
    if (STATE.overlayEl) STATE.overlayEl.remove();

    const overlay = document.createElement("div");
    overlay.id = "nv-dyslexia-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100vw; height: 100vh;
      background-color: ${color};
      opacity: ${opacity};
      pointer-events: none;
      z-index: 2147483646;
    `;
    document.body.appendChild(overlay);
    STATE.overlayEl = overlay;
  }

  function removeOverlay() {
    STATE.overlayEl?.remove();
    STATE.overlayEl = null;
  }

  function updateOverlay(color, opacity) {
    if (!STATE.overlayEl) {
      createOverlay(color, opacity);
      return;
    }
    STATE.overlayEl.style.backgroundColor = color;
    STATE.overlayEl.style.opacity = opacity;
  }

  // ─── Reading Ruler (line highlight) ───────────────────────────────────────
  function createReadingRuler() {
    if (STATE.rulerEl) return;

    const ruler = document.createElement("div");
    ruler.id = "nv-dyslexia-ruler";
    ruler.setAttribute("aria-hidden", "true");
    document.body.appendChild(ruler);
    STATE.rulerEl = ruler;

    const onMove = (e) => {
      ruler.style.top = `${e.clientY - 19}px`; // centred within 38px band
    };
    document.addEventListener("mousemove", onMove);
    STATE._rulerListener = onMove;
  }

  function removeReadingRuler() {
    STATE.rulerEl?.remove();
    STATE.rulerEl = null;
    if (STATE._rulerListener) {
      document.removeEventListener("mousemove", STATE._rulerListener);
      STATE._rulerListener = null;
    }
  }

  // ─── Syllable Rainbow ──────────────────────────────────────────────────────
  // Novel feature: each syllable in a word is wrapped in a colored span.
  // Alternating 2 colors per word helps the eye group syllables.
  // Color intensity is mild to avoid sensory overload.
  const SYL_COLORS = ["#1A8C7A", "#D95E4B"]; // Teal / coral — softer, less fatiguing

  function applySyllableHighlight() {
    if (STATE.syllableActive) return;
    STATE.syllableActive = true;

    const { element: mainEl } = NV.readabilityScorer.extractMainContent();
    if (!mainEl) return;

    const walker = document.createTreeWalker(
      mainEl,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (
            parent.closest(".nv-syl-word") ||
            parent.closest("[id^='nv-']") ||
            parent.tagName === "SCRIPT" ||
            parent.tagName === "STYLE"
          ) {
            return NodeFilter.FILTER_REJECT;
          }
          return node.textContent.trim().length > 0
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        },
      }
    );

    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);

    nodes.forEach((textNode) => {
      if (textNode.__nvSylDone) return;
      textNode.__nvSylDone = true;

      const frag = document.createDocumentFragment();
      const words = textNode.textContent.split(/(\s+)/);

      words.forEach((part) => {
        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(part));
          return;
        }

        const syllables = NV.algorithms.splitIntoSyllables(part);
        if (syllables.length <= 1) {
          frag.appendChild(document.createTextNode(part));
          return;
        }

        const wordSpan = document.createElement("span");
        wordSpan.className = "nv-syl-word";

        syllables.forEach((syl, i) => {
          const sylSpan = document.createElement("span");
          sylSpan.className = "nv-syl";
          sylSpan.style.color = SYL_COLORS[i % SYL_COLORS.length];
          sylSpan.textContent = syl;
          wordSpan.appendChild(sylSpan);
        });

        frag.appendChild(wordSpan);
      });

      STATE.originalNodes.set(textNode, textNode.textContent);
      textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  function removeSyllableHighlight() {
    if (!STATE.syllableActive) return;
    STATE.syllableActive = false;

    document.querySelectorAll(".nv-syl-word").forEach((wordSpan) => {
      const text = wordSpan.textContent;
      wordSpan.parentNode.replaceChild(document.createTextNode(text), wordSpan);
    });

    document.querySelectorAll(".nv-syl-word, .nv-syl").forEach((el) => el.remove());

    STATE.originalNodes.clear();
  }

  // ─── Beeline Colors (Line-by-Line Color Gradient) ─────────────────────────
  // Each line of text gets a distinct color that progresses through a spectrum.
  // This guides the eye from end of one line to start of the next.
  // Implementation: wrap each paragraph line in a colored span using Range API.
  const BEELINE_PALETTE = [
    "#C0392B", "#E67E22", "#F1C40F",
    "#27AE60", "#2980B9", "#8E44AD",
  ];

  function applyBeelineColors() {
    if (STATE.beelineActive) return;
    STATE.beelineActive = true;

    const { element: mainEl } = NV.readabilityScorer.extractMainContent();
    if (!mainEl) return;

    // Add CSS class that signals beeline is active for per-paragraph coloring
    const styleEl = getOrCreateStyle("nv-beeline-colors");
    styleEl.textContent = `
      html.nv-dyslexia-mode.nv-beeline p {
        background: linear-gradient(
          to bottom,
          rgba(255,255,255,0) 0%,
          rgba(255,255,255,0) 100%
        );
      }
      /* Each paragraph gets a left border color cycling through palette */
      html.nv-dyslexia-mode.nv-beeline p:nth-child(6n+1) { border-left: 4px solid ${BEELINE_PALETTE[0]}; padding-left: 8px; }
      html.nv-dyslexia-mode.nv-beeline p:nth-child(6n+2) { border-left: 4px solid ${BEELINE_PALETTE[1]}; padding-left: 8px; }
      html.nv-dyslexia-mode.nv-beeline p:nth-child(6n+3) { border-left: 4px solid ${BEELINE_PALETTE[2]}; padding-left: 8px; }
      html.nv-dyslexia-mode.nv-beeline p:nth-child(6n+4) { border-left: 4px solid ${BEELINE_PALETTE[3]}; padding-left: 8px; }
      html.nv-dyslexia-mode.nv-beeline p:nth-child(6n+5) { border-left: 4px solid ${BEELINE_PALETTE[4]}; padding-left: 8px; }
      html.nv-dyslexia-mode.nv-beeline p:nth-child(6n+6) { border-left: 4px solid ${BEELINE_PALETTE[5]}; padding-left: 8px; }
    `;

    document.documentElement.classList.add("nv-beeline");
  }

  function removeBeelineColors() {
    if (!STATE.beelineActive) return;
    STATE.beelineActive = false;
    document.getElementById("nv-beeline-colors")?.remove();
    document.documentElement.classList.remove("nv-beeline");
  }

  // ─── Word Hover Tooltip (Simplified Definition) ───────────────────────────
  let _wordTooltip = null;
  let _wordTooltipTimeout = null;

  // Built-in dictionary for common difficult words — works without Ollama
  const WORD_DICT = {
    aberrant: "different from what is normal or expected",
    abrogate: "to officially end or cancel something",
    ambiguous: "unclear — can mean more than one thing",
    ameliorate: "to make something bad less severe",
    anachronism: "something that belongs to a different time period",
    anomaly: "something unusual that doesn't fit the pattern",
    archaic: "very old or old-fashioned",
    benevolent: "kind and generous",
    clandestine: "done secretly",
    cognizant: "aware or conscious of something",
    convoluted: "extremely complicated and hard to follow",
    corroborate: "to confirm or give support to a statement",
    dichotomy: "a split into two opposite things",
    didactic: "intended to teach something",
    disparate: "very different from each other",
    egregious: "outstandingly bad or shocking",
    eloquent: "well-spoken and clear",
    ephemeral: "lasting for only a short time",
    esoteric: "understood only by a small group",
    exacerbate: "to make a problem worse",
    facetious: "not being serious when you should be",
    fastidious: "very careful about details or cleanliness",
    flagrant: "clearly wrong and shocking",
    gregarious: "enjoying being around other people",
    hegemony: "dominance or control over others",
    hyperbole: "an exaggeration used for effect",
    impetuous: "acting quickly without thinking",
    innocuous: "harmless",
    insidious: "dangerous but developing gradually and secretly",
    laconic: "using very few words",
    lethargic: "lacking energy or enthusiasm",
    magnanimous: "generous and forgiving",
    meticulous: "very careful and precise",
    mitigate: "to reduce the severity of something",
    nebulous: "unclear or vague",
    nefarious: "wicked or criminal",
    obfuscate: "to make something unclear on purpose",
    obsolete: "no longer used or needed",
    omnipotent: "having unlimited power",
    paradigm: "a typical example or pattern",
    paradox: "a statement that seems contradictory but may be true",
    perfunctory: "done with little care or effort",
    perspicacious: "having a clear understanding of things",
    pragmatic: "dealing with problems in a practical way",
    pretentious: "trying to appear more important than you really are",
    prolific: "producing a lot",
    recalcitrant: "refusing to obey or cooperate",
    rhetoric: "persuasive language, sometimes used to exaggerate",
    sycophant: "a person who flatters others to gain advantages",
    tenacious: "keeping a firm grip; determined",
    ubiquitous: "found everywhere",
    verbose: "using more words than needed",
    vindicate: "to prove someone was right or not guilty",
  };

  let _wordDismissTimer = null;

  function enableWordTooltip() {
    if (_wordTooltip) return;
    _wordTooltip = document.createElement("div");
    _wordTooltip.id = "nv-word-tooltip";
    _wordTooltip.setAttribute("role", "tooltip");
    _wordTooltip.setAttribute("aria-live", "polite");
    document.body.appendChild(_wordTooltip);

    document.addEventListener("dblclick", async (e) => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const word = selection.toString().trim().toLowerCase().replace(/[^a-z]/g, "");
      if (!word || word.length < 3 || word.length > 30) return;

      const context = selection.anchorNode?.parentElement?.innerText || "";

      clearTimeout(_wordDismissTimer);
      _wordTooltip.textContent = "Looking up…";
      _wordTooltip.style.left = `${e.pageX + 12}px`;
      _wordTooltip.style.top  = `${e.pageY - 44}px`;
      _wordTooltip.style.display = "block";

      // Check built-in dictionary first (instant, no network needed)
      if (WORD_DICT[word]) {
        _wordTooltip.textContent = `${word}: ${WORD_DICT[word]}`;
      } else if (NV.ollama.isAvailable()) {
        try {
          const explanation = await NV.ollama.explainWord(word, context);
          _wordTooltip.textContent = explanation || `No definition found for "${word}"`;
        } catch {
          _wordTooltip.textContent = `Could not look up "${word}"`;
        }
      } else {
        _wordTooltip.textContent = `"${word}" — not in built-in dictionary`;
      }

      // Auto-dismiss after 4 s
      _wordDismissTimer = setTimeout(() => {
        if (_wordTooltip) _wordTooltip.style.display = "none";
      }, 4000);
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest("#nv-word-tooltip")) {
        clearTimeout(_wordDismissTimer);
        if (_wordTooltip) _wordTooltip.style.display = "none";
      }
    });
  }

  function disableWordTooltip() {
    _wordTooltip?.remove();
    _wordTooltip = null;
  }

  // ─── Helper ───────────────────────────────────────────────────────────────
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

    document.documentElement.classList.add("nv-dyslexia-mode");

    if (settings.customFont) loadFont(settings.fontChoice);
    applySpacing(settings);
    if (settings.colorOverlay) createOverlay(settings.overlayColor, settings.overlayOpacity);
    if (settings.readingRuler) createReadingRuler();
    if (settings.syllableHighlight) applySyllableHighlight();
    if (settings.beelineColors) applyBeelineColors();
    enableWordTooltip();
  }

  async function deactivate() {
    if (!STATE.active) return;
    STATE.active = false;

    document.documentElement.classList.remove("nv-dyslexia-mode");

    removeFont();
    removeSpacing();
    removeOverlay();
    removeReadingRuler();
    removeSyllableHighlight();
    removeBeelineColors();
    disableWordTooltip();
  }

  function updateSetting(key, value) {
    if (!STATE.settings) return;
    STATE.settings[key] = value;

    switch (key) {
      case "customFont":
        value ? loadFont(STATE.settings.fontChoice) : removeFont();
        break;
      case "fontChoice":
        loadFont(value);
        break;
      case "letterSpacing":
      case "wordSpacing":
      case "lineHeight":
      case "fontSize":
      case "lineWidth":
        applySpacing(STATE.settings);
        break;
      case "colorOverlay":
        value
          ? createOverlay(STATE.settings.overlayColor, STATE.settings.overlayOpacity)
          : removeOverlay();
        break;
      case "overlayColor":
        updateOverlay(value, STATE.settings.overlayOpacity);
        break;
      case "overlayOpacity":
        updateOverlay(STATE.settings.overlayColor, value);
        break;
      case "readingRuler":
        value ? createReadingRuler() : removeReadingRuler();
        break;
      case "syllableHighlight":
        value ? applySyllableHighlight() : removeSyllableHighlight();
        break;
      case "beelineColors":
        value ? applyBeelineColors() : removeBeelineColors();
        break;
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  NV.dyslexia = {
    activate,
    deactivate,
    updateSetting,
    isActive: () => STATE.active,
  };
})();
