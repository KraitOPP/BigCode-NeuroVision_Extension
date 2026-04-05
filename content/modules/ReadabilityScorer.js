/**
 * NeuroVision — Readability Scorer
 * Extracts main content and computes all readability/accessibility metrics.
 */
(function () {
  "use strict";

  const NV = (window.NeuroVision = window.NeuroVision || {});
  const alg = () => NV.algorithms;

  // ─── Content Extraction ───────────────────────────────────────────────────
  // Priority order of semantic content containers
  const CONTENT_SELECTORS = [
    "article",
    "main",
    '[role="main"]',
    ".post-content",
    ".article-body",
    ".entry-content",
    ".content-body",
    ".story-body",
    "#content",
    "#main",
    ".main-content",
  ];

  // Elements that are almost never content
  const NOISE_SELECTORS = [
    "nav",
    "header",
    "footer",
    "aside",
    ".sidebar",
    ".advertisement",
    ".ad",
    '[class*="banner"]',
    '[class*="popup"]',
    '[class*="modal"]',
    "script",
    "style",
    "noscript",
    "iframe",
    ".cookie-notice",
    ".newsletter-signup",
  ];

  function extractMainContent() {
    // Try semantic selectors first
    for (const sel of CONTENT_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.innerText || "";
        if (text.trim().length > 200) return { element: el, text };
      }
    }

    // Fallback: find the element with the most text content
    let best = document.body;
    let bestScore = 0;
    const candidates = document.querySelectorAll(
      "div, section, article, p"
    );

    candidates.forEach((el) => {
      const text = el.innerText || "";
      const words = text.split(/\s+/).filter(Boolean).length;
      const linkWords = Array.from(el.querySelectorAll("a"))
        .map((a) => (a.innerText || "").split(/\s+/).length)
        .reduce((a, b) => a + b, 0);
      // Penalize link-heavy elements (nav, footer-like)
      const score = words - linkWords * 2;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    });

    return { element: best, text: best.innerText || "" };
  }

  // ─── Compute Page Metrics ─────────────────────────────────────────────────
  function computeMetrics() {
    const { element: mainEl, text: mainText } = extractMainContent();

    const words = alg().tokenizeWords(mainText);
    const animatedElements = document.querySelectorAll(
      "[style*='animation'], [style*='transition']"
    );
    const cssAnimations = Array.from(document.styleSheets).reduce(
      (count, sheet) => {
        try {
          return (
            count +
            Array.from(sheet.cssRules || []).filter(
              (r) => r.type === CSSRule.KEYFRAMES_RULE
            ).length
          );
        } catch {
          return count;
        }
      },
      0
    );

    // Ad/noise element detection
    const adPatterns =
      /ad|advertisement|banner|sponsor|promo|affiliate|commercial/i;
    const adCount = Array.from(
      document.querySelectorAll('[class], [id]')
    ).filter(
      (el) =>
        adPatterns.test(el.className || "") || adPatterns.test(el.id || "")
    ).length;

    const metrics = {
      readingGrade: alg().fleschKincaidGrade(mainText),
      readingEase: alg().fleschReadingEase(mainText),
      wordCount: words.length,
      sentenceCount: alg().tokenizeSentences(mainText).length,
      uniqueColors: alg().estimateUniqueColors(document.body),
      animationCount: cssAnimations + animatedElements.length,
      adCount: adCount,
      linkDensity: alg().getLinkDensity(mainEl),
      nestedDepth: alg().getMaxDepth(mainEl),
      imageCount: document.querySelectorAll("img").length,
      readingTime: alg().estimateReadingTime(mainText),
      readingTimeDyslexia: alg().estimateReadingTime(mainText, 120),
    };

    metrics.cognitiveLoad = alg().computeCognitiveLoad(metrics);
    metrics.mainElement = mainEl;
    metrics.mainText = mainText;

    return metrics;
  }

  // ─── Grade → Label ────────────────────────────────────────────────────────
  function gradeToLabel(grade) {
    if (grade <= 5) return { label: "Very Easy", color: "#4CAF50" };
    if (grade <= 8) return { label: "Easy", color: "#8BC34A" };
    if (grade <= 10) return { label: "Moderate", color: "#FFC107" };
    if (grade <= 12) return { label: "Difficult", color: "#FF9800" };
    return { label: "Very Difficult", color: "#F44336" };
  }

  function cognitiveLoadLabel(score) {
    if (score <= 20) return { label: "Low", color: "#4CAF50" };
    if (score <= 45) return { label: "Moderate", color: "#FFC107" };
    if (score <= 70) return { label: "High", color: "#FF9800" };
    return { label: "Very High", color: "#F44336" };
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  NV.readabilityScorer = {
    extractMainContent,
    computeMetrics,
    gradeToLabel,
    cognitiveLoadLabel,
    CONTENT_SELECTORS,
    NOISE_SELECTORS,
  };
})();
