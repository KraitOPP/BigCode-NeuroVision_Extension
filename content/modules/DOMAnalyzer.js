/**
 * NeuroVision — DOM Analyzer
 * Classifies page elements by type and cognitive impact.
 * Provides element maps used by condition modules.
 */
(function () {
  "use strict";

  const NV = (window.NeuroVision = window.NeuroVision || {});

  // ─── Guard: never touch NeuroVision's own UI elements ────────────────────
  function isNvOwnElement(el) {
    if (!el || el.nodeType !== 1) return false;
    const id = el.id || "";
    if (id.startsWith("nv-")) return true;
    const cls = el.className;
    const clsStr = (typeof cls === "string" ? cls : cls?.toString?.() || "");
    return clsStr.split(/\s+/).some(c => c.startsWith("nv-"));
  }

  // ─── Element Classification ───────────────────────────────────────────────

  const DISTRACTION_PATTERNS = {
    class: /\b(ad|ads|advert|advertisement|banner|promo|sponsor|sidebar|popup|modal|overlay|cookie|newsletter|subscribe|social|share|related|recommended|outbrain|taboola|revcontent|mgid|doubleclick|dfp|adsense|ad-slot|ad-unit|ad-wrap|native-ad|paid-content|partner-content)\b/i,
    id:    /\b(ad|ads|banner|promo|sidebar|popup|modal|cookie|newsletter|outbrain|taboola|dfp|gpt-ad|div-gpt|adunit|adslot)\b/i,
    role:  /^(banner|complementary|form)$/,
    attr:  ["data-outbrain-id","data-taboola-id","data-ad-slot","data-ad-client","data-googletag"],
  };

  const CONTENT_TAGS = new Set([
    "p", "h1", "h2", "h3", "h4", "h5", "h6",
    "li", "blockquote", "td", "th", "figcaption",
    "article", "section", "main",
  ]);

  const DECORATIVE_PATTERNS = /icon|logo|avatar|decoration|ornament|bg-|background/i;

  function classifyElement(el) {
    // Never classify NeuroVision UI elements as distractions
    if (isNvOwnElement(el)) return "structural";

    const tag = el.tagName.toLowerCase();
    const cls = el.className || "";
    const id = el.id || "";
    const role = el.getAttribute("role") || "";

    if (
      DISTRACTION_PATTERNS.class.test(cls) ||
      DISTRACTION_PATTERNS.id.test(id) ||
      DISTRACTION_PATTERNS.role.test(role) ||
      DISTRACTION_PATTERNS.attr.some(a => el.hasAttribute(a))
    ) {
      return "distraction";
    }

    if (tag === "img") {
      const alt = el.getAttribute("alt") || "";
      const src = el.src || "";
      if (!alt || DECORATIVE_PATTERNS.test(cls) || DECORATIVE_PATTERNS.test(src)) {
        return "decorative-image";
      }
      return "content-image";
    }

    if (tag === "video" || tag === "iframe") return "media";
    if (["nav", "header", "footer"].includes(tag)) return "navigation";
    if (CONTENT_TAGS.has(tag)) return "content";
    if (tag === "a") return "link";
    if (tag === "button" || tag === "input" || tag === "select") return "interactive";

    // Check for large text containers
    const text = el.innerText || "";
    if (text.length > 100 && el.children.length < 10) return "content";

    return "structural";
  }

  // ─── Animation Detection ──────────────────────────────────────────────────
  function findAnimatedElements() {
    const animated = [];

    // Inline style animations (skip NV elements)
    document.querySelectorAll("[style]").forEach((el) => {
      if (isNvOwnElement(el)) return;
      const style = el.getAttribute("style") || "";
      if (/animation|transition/.test(style)) animated.push(el);
    });

    // Elements with animation classes (skip NV elements)
    document.querySelectorAll("[class]").forEach((el) => {
      if (isNvOwnElement(el)) return;
      const cls = el.className || "";
      if (/animate|slide|fade|bounce|spin|rotate|pulse|flash|blink/.test(cls)) {
        animated.push(el);
      }
    });

    // GIF images (skip NV elements)
    document.querySelectorAll("img[src$='.gif']").forEach((el) => {
      if (!isNvOwnElement(el)) animated.push(el);
    });

    return [...new Set(animated)];
  }

  // ─── Flashing Content Detection ───────────────────────────────────────────
  function findFlashingElements() {
    const flashing = [];
    document.querySelectorAll("[class]").forEach((el) => {
      const cls = el.className || "";
      if (/blink|flash|strobe/.test(cls)) flashing.push(el);
    });
    // Check computed animation names
    document.querySelectorAll("*").forEach((el) => {
      const anim = window.getComputedStyle(el).animationName;
      if (anim && /blink|flash|strobe/.test(anim)) flashing.push(el);
    });
    return [...new Set(flashing)];
  }

  // ─── Pop-up / Overlay Detection ───────────────────────────────────────────
  function findOverlays() {
    const overlays = [];
    document.querySelectorAll("*").forEach((el) => {
      if (isNvOwnElement(el)) return; // Never treat NV elements as overlays
      const style = window.getComputedStyle(el);
      if (
        (style.position === "fixed" || style.position === "sticky") &&
        style.zIndex > 100 &&
        style.display !== "none" &&
        el.offsetHeight > 0
      ) {
        const cls = (el.className || "").toString();
        const id = el.id || "";
        if (
          /popup|modal|overlay|cookie|newsletter|banner|toast|notification/i.test(cls) ||
          /popup|modal|overlay|cookie|newsletter/i.test(id)
        ) {
          overlays.push(el);
        }
      }
    });
    return overlays;
  }

  // ─── Full Page Scan ───────────────────────────────────────────────────────
  function analyzePage() {
    const elements = {
      distractions: [],
      content: [],
      navigation: [],
      media: [],
      links: [],
      interactive: [],
      decorativeImages: [],
      contentImages: [],
      structural: [],
      animated: findAnimatedElements(),
      flashing: findFlashingElements(),
      overlays: findOverlays(),
    };

    document.querySelectorAll("body *").forEach((el) => {
      if (el.offsetParent === null && el.tagName !== "BODY") return; // Skip hidden
      const type = classifyElement(el);
      switch (type) {
        case "distraction":      elements.distractions.push(el); break;
        case "content":          elements.content.push(el); break;
        case "navigation":       elements.navigation.push(el); break;
        case "media":            elements.media.push(el); break;
        case "link":             elements.links.push(el); break;
        case "interactive":      elements.interactive.push(el); break;
        case "decorative-image": elements.decorativeImages.push(el); break;
        case "content-image":    elements.contentImages.push(el); break;
        default:                 elements.structural.push(el); break;
      }
    });

    return elements;
  }

  // ─── MutationObserver for Dynamic Pages ───────────────────────────────────
  let _observer = null;

  function watchForNewOverlays(callback) {
    if (_observer) _observer.disconnect();
    _observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (isNvOwnElement(node)) return; // Never intercept NV elements
            const style = window.getComputedStyle(node);
            if (style.position === "fixed" && parseInt(style.zIndex) > 100) {
              callback(node);
            }
          }
        });
      });
    });
    _observer.observe(document.body, { childList: true, subtree: true });
    return () => _observer.disconnect();
  }

  function stopWatching() {
    if (_observer) {
      _observer.disconnect();
      _observer = null;
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  NV.domAnalyzer = {
    isNvOwnElement,
    classifyElement,
    findAnimatedElements,
    findFlashingElements,
    findOverlays,
    analyzePage,
    watchForNewOverlays,
    stopWatching,
  };
})();
