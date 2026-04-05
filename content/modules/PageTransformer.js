/**
 * NeuroVision — Page Transformer v5
 *
 * Two rendering modes:
 *   CONTENT mode  — full reader layout (articles, news, docs, gov sites)
 *   FUNCTIONAL mode — accessibility overlay only, DOM untouched (login, ERP, dashboards)
 *
 * Content mode pipeline:
 *   1. Detect if functional page → if yes, take functional path
 *   2. Extract ALL DOM content: text, images (lazy-load aware), videos, tables, links
 *   3. Skip inline ads (outbrain, taboola, doubleclick, etc.)
 *   4. Render reader layout immediately with fallback metadata (~1s)
 *   5. LLM runs in background, enhances section types + sidebar in-place
 *
 * Model: qwen2.5:7b-instruct-q4_K_M
 */
(function () {
  "use strict";

  const NV = (window.NeuroVision = window.NeuroVision || {});

  // ─── Special item markers (null-byte prefix never appears in real text) ────────
  const IMG_MARK  = "\x00IMG\x00";   // src|alt
  const TBL_MARK  = "\x00TBL\x00";   // html|caption
  const HTML_MARK = "\x00HTML\x00";  // sanitized innerHTML (has links)
  const VID_MARK  = "\x00VID\x00";   // src|title|type  (type: youtube|vimeo|native)

  function isSpecialItem(s) { return typeof s === "string" && s.charCodeAt(0) === 0; }

  // ─── State ────────────────────────────────────────────────────────────────────
  const STATE = {
    active:         false,
    mode:           "content",   // "content" | "functional"
    overlayEl:      null,
    analysis:       null,
    savedChildren:  null,
    savedBodyStyle: "",
    savedTitle:     "",
    _progressListener: null,
    _observer:      null,
  };

  // ─── Section type visual config ───────────────────────────────────────────────
  const TYPE_CFG = {
    hero:    { icon: "📄", label: "Introduction", accent: "#4A6FA5" },
    content: { icon: "📝", label: "Content",      accent: "#4A6FA5" },
    callout: { icon: "⚡", label: "Key Info",     accent: "#D97706" },
    warning: { icon: "⚠️", label: "Important",   accent: "#DC2626" },
    steps:   { icon: "📋", label: "Steps",        accent: "#059669" },
    faq:     { icon: "❓", label: "FAQ",          accent: "#7C3AED" },
    links:   { icon: "🔗", label: "Links",        accent: "#0891B2" },
    media:   { icon: "🎬", label: "Media",        accent: "#0891B2" },
  };

  const SKIP_TAGS  = new Set(["nav","header","footer","aside","form","iframe","script","style","noscript","svg","canvas"]);
  const SKIP_ROLES = new Set(["navigation","banner","complementary","contentinfo","search"]);

  // Ad / promotional content patterns (skip during extraction)
  const AD_CLS = /\b(outbrain|taboola|revcontent|mgid|adsby|adsense|doubleclick|dfp|ad-slot|ad-unit|ad-wrap|ad-container|advert|advertisement|sponsored|promoted|sponsor-label|promo-unit|native-ad|paid-content|partner-content|buzz-widget)\b/i;
  const AD_ID  = /\b(outbrain|taboola|dfp|adunit|adslot|gpt-ad|div-gpt|adsense)\b/i;
  const AD_ATTRS = ["data-outbrain-id","data-taboola-id","data-ad-slot","data-ad-client","data-googletag"];

  function isAdElement(el) {
    const cls = (typeof el.className === "string" ? el.className : el.className?.toString?.() || "");
    const id  = el.id || "";
    if (AD_CLS.test(cls) || AD_ID.test(id)) return true;
    return AD_ATTRS.some(a => el.hasAttribute(a));
  }

  // Get real image src from lazy-loaded images (all known patterns)
  function getLazySrc(el) {
    return el.getAttribute("data-src")
      || el.getAttribute("data-lazy-src")
      || el.getAttribute("data-lazy")
      || el.getAttribute("data-original")
      || el.getAttribute("data-vsrc")
      || el.getAttribute("data-url")
      || el.getAttribute("data-img-src")
      || el.getAttribute("data-echo")
      || el.getAttribute("data-hi-res-src")
      || parseSrcset(el.getAttribute("srcset") || el.getAttribute("data-srcset"))
      || el.src
      || "";
  }

  function parseSrcset(srcset) {
    if (!srcset) return "";
    // Pick the largest image from srcset
    const parts = srcset.split(",").map(s => s.trim()).filter(Boolean);
    if (!parts.length) return "";
    // Sort by width descriptor (pick last = largest), fallback to first
    const sorted = parts.map(p => {
      const [url, w] = p.split(/\s+/);
      return { url: url || "", w: parseInt(w) || 0 };
    }).sort((a, b) => b.w - a.w);
    return sorted[0]?.url || "";
  }

  // ─── Functional page detection ────────────────────────────────────────────────
  // "Functional" = ERP, login, dashboard, checkout — built around forms, not prose.
  // We require MULTIPLE strong signals to avoid false-positives on blog/news pages
  // that have a search box, newsletter input, or a chat widget (which can inject
  // 10+ hidden inputs and inflate the count).
  function isFunctionalPage() {
    const hostname = window.location.hostname.toLowerCase();
    const path     = window.location.pathname.toLowerCase();

    // 1. Hostname subdomain signals (e.g. erp.iiita.ac.in, portal.gov.in)
    if (/^(erp|crm|lms|portal|admin|dashboard|intranet|sso|login|auth)\./i.test(hostname)) return true;

    // 2. Path-segment signals — keyword must be a full path segment
    if (/\/(login|signin|signup|register|checkout|cart|my-account|dashboard|admin|portal|erp|crm|lms)\b/i.test(path)) return true;

    // 3. DOM density — count VISIBLE inputs that are inside a <form> element only
    //    (filters out chat widgets, search bars, newsletter boxes which aren't forms)
    const formInputs = Array.from(
      document.querySelectorAll("form input:not([type='hidden']), form select, form textarea")
    ).filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null;
    });

    const forms   = document.querySelectorAll("form").length;
    const allText = (document.body?.innerText || "").trim();
    const words   = allText.split(/\s+/).filter(Boolean).length;

    // Strong: many visible form inputs AND sparse prose
    if (formInputs.length >= 5 && words < 400) return true;
    // Medium: multiple forms with inputs AND not a content-rich page
    if (forms >= 2 && formInputs.length >= 4 && words < 800) return true;
    // Very strong: overwhelming form density
    if (formInputs.length >= 12) return true;

    return false;
  }

  // ─── HTML sanitiser — preserves links, removes scripts/events ────────────────
  function sanitizeInnerHtml(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll("script,style,noscript,iframe").forEach(n => n.remove());
    clone.querySelectorAll("*").forEach(n => {
      Array.from(n.attributes).forEach(attr => {
        if (attr.name.startsWith("on")) n.removeAttribute(attr.name);
      });
      if (n.tagName === "A") {
        const href = n.getAttribute("href");
        if (href) {
          try {
            n.setAttribute("href", new URL(href, window.location.href).href);
          } catch { /* leave relative */ }
          n.setAttribute("target", "_blank");
          n.setAttribute("rel", "noopener noreferrer");
        }
      }
      // Fix lazy images inside sanitized content
      if (n.tagName === "IMG") {
        const lazySrc = getLazySrc(n);
        if (lazySrc) n.setAttribute("src", lazySrc);
      }
    });
    return clone.innerHTML;
  }

  function sanitizeTableHtml(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll("script,style").forEach(n => n.remove());
    clone.querySelectorAll("*").forEach(n => {
      Array.from(n.attributes).forEach(attr => {
        if (attr.name.startsWith("on") || attr.name === "style") n.removeAttribute(attr.name);
      });
    });
    return clone.outerHTML;
  }

  // ─── 1. DOM → Sections ───────────────────────────────────────────────────────

  // Inner extractor that walks a specific root element.
  // Called by extractDOMSections() and, on retry, directly with document.body.
  function extractDOMSectionsFromRoot(root) {
    function inSkipZone(el) {
      let p = el.parentElement;
      while (p && p !== root) {
        if (SKIP_TAGS.has(p.tagName?.toLowerCase())) return true;
        if (SKIP_ROLES.has(p.getAttribute?.("role") || "")) return true;
        if (/^nv-/.test(p.id || "")) return true;
        if (isAdElement(p)) return true; // Skip elements inside ad containers
        p = p.parentElement;
      }
      return false;
    }

    const handledTables  = new Set();
    const handledFigures = new Set();
    const sections       = [];
    let   current        = null;

    function ensureCurrent() {
      if (!current) {
        current = { heading: "", level: 0, paragraphs: [], isOrdered: false };
        sections.push(current);
      }
    }

    // Query all relevant elements in document order
    // NOTE: amp-img is a custom element used by AMP pages (NDTV etc.)
    const elems = Array.from(
      root.querySelectorAll(
        "h1,h2,h3,h4,h5,h6,p,li,blockquote,img,amp-img,picture,figure,table,iframe,video"
      )
    ).filter(el => !inSkipZone(el) && !isAdElement(el));

    for (const el of elems) {
      const tag = el.tagName.toLowerCase();

      // ── Video: YouTube / Vimeo iframes, native <video> ──────────────────────
      if (tag === "iframe" || tag === "video") {
        const src = el.src || el.getAttribute("data-src") || "";
        if (!src && tag === "video") {
          // native video with <source> children
          const source = el.querySelector("source");
          if (!source?.src) continue;
          ensureCurrent();
          const title = el.getAttribute("title") || el.getAttribute("aria-label") || "";
          current.paragraphs.push(`${VID_MARK}${source.src}|${title}|native`);
          continue;
        }
        if (!src) continue;
        if (/youtube\.com\/embed|youtu\.be/i.test(src)) {
          ensureCurrent();
          const title = el.getAttribute("title") || "Video";
          current.paragraphs.push(`${VID_MARK}${src}|${title}|youtube`);
        } else if (/vimeo\.com/i.test(src)) {
          ensureCurrent();
          const title = el.getAttribute("title") || "Video";
          current.paragraphs.push(`${VID_MARK}${src}|${title}|vimeo`);
        }
        continue;
      }

      // ── Figure (image + optional caption) ───────────────────────────────────
      if (tag === "figure") {
        if (handledFigures.has(el)) continue;
        handledFigures.add(el);
        const imgEl = el.querySelector("img,amp-img");
        if (!imgEl) continue;
        const src = getLazySrc(imgEl);
        if (!src || src.length < 5) continue;
        const alt = imgEl.getAttribute("alt") || el.querySelector("figcaption")?.innerText?.trim() || "";
        if (/^(icon|logo|avatar|sprite|pixel|1x1)/i.test(src.split("/").pop())) continue;
        ensureCurrent();
        current.paragraphs.push(`${IMG_MARK}${src}|${alt}`);
        continue;
      }

      // ── AMP img ─────────────────────────────────────────────────────────────
      if (tag === "amp-img") {
        if (el.closest("figure")) continue;
        const src = getLazySrc(el) || el.getAttribute("src") || "";
        if (!src || src.length < 5) continue;
        const alt = el.getAttribute("alt") || "";
        ensureCurrent();
        current.paragraphs.push(`${IMG_MARK}${src}|${alt}`);
        continue;
      }

      // ── Picture element ──────────────────────────────────────────────────────
      if (tag === "picture") {
        if (el.closest("figure") || el.closest("picture")) continue;
        const imgEl = el.querySelector("img");
        if (!imgEl) continue;
        const src = getLazySrc(imgEl);
        if (!src || src.length < 5) continue;
        const alt = imgEl.getAttribute("alt") || "";
        ensureCurrent();
        current.paragraphs.push(`${IMG_MARK}${src}|${alt}`);
        continue;
      }

      // ── Table ────────────────────────────────────────────────────────────────
      if (tag === "table") {
        if (handledTables.has(el) || el.closest("table")) continue;
        handledTables.add(el);
        if (el.querySelectorAll("tr").length < 2) continue;
        ensureCurrent();
        const caption = el.querySelector("caption")?.innerText?.trim()
          || el.querySelector("thead th")?.innerText?.trim() || "";
        current.paragraphs.push(`${TBL_MARK}${sanitizeTableHtml(el)}|${caption}`);
        continue;
      }

      // ── Standalone img ──────────────────────────────────────────────────────
      if (tag === "img") {
        if (el.closest("figure") || el.closest("picture") || el.closest("table")) continue;
        const src = getLazySrc(el);
        const alt = el.getAttribute("alt") || "";
        if (!src || src.length < 5) continue;
        // Skip icons / tracking pixels
        if (el.naturalWidth > 0 && el.naturalWidth < 80) continue;
        const fname = src.split("/").pop()?.split("?")[0] || "";
        if (!alt && /^(icon|logo|avatar|sprite|pixel|1x1|blank|spacer|dot)/i.test(fname)) continue;
        if (!alt && /\.(gif)$/i.test(fname) && !src.includes("media")) continue;
        ensureCurrent();
        current.paragraphs.push(`${IMG_MARK}${src}|${alt}`);
        continue;
      }

      // ── Skip content inside tables/figures (handled above) ──────────────────
      if (el.closest("table") || el.closest("figure") || el.closest("picture")) continue;

      const text = (el.innerText || "").replace(/\s+/g, " ").trim();

      // ── Headings ─────────────────────────────────────────────────────────────
      if (/^h[1-6]$/.test(tag)) {
        if (!text || text.length < 2) continue;
        current = { heading: text, level: parseInt(tag[1]), paragraphs: [], isOrdered: false };
        sections.push(current);
        continue;
      }

      // ── Text content ─────────────────────────────────────────────────────────
      if (!text || text.length < 10) continue;
      ensureCurrent();
      if (tag === "li" && el.closest("ol")) current.isOrdered = true;

      // Preserve HTML if paragraph contains links (so they stay clickable)
      const hasLinks = el.querySelectorAll("a[href]").length > 0;
      if (hasLinks) {
        current.paragraphs.push(`${HTML_MARK}${sanitizeInnerHtml(el)}`);
      } else {
        current.paragraphs.push(text);
      }
    }

    // ── Collect inline "related/sponsored" link blocks as a Links section ─────
    // News sites often have outbrain/taboola containers that inSkipZone skips;
    // instead grab the visible text links from ad zones as a "Related" section.
    const relatedLinks = [];
    document.querySelectorAll("[class*='related'],[class*='more-news'],[class*='also-read'],[id*='related']").forEach(container => {
      if (isAdElement(container)) return;
      container.querySelectorAll("a[href]").forEach(a => {
        const href = a.getAttribute("href");
        const linkText = (a.innerText || a.getAttribute("title") || "").trim();
        if (!href || !linkText || linkText.length < 5) return;
        try {
          const abs = new URL(href, window.location.href).href;
          relatedLinks.push(`${HTML_MARK}<a href="${abs}" target="_blank" rel="noopener noreferrer">${escHtml(linkText)}</a>`);
        } catch { /* skip invalid URLs */ }
      });
    });

    if (relatedLinks.length > 0) {
      sections.push({
        heading: "Related Articles",
        level: 2,
        paragraphs: relatedLinks.slice(0, 12),
        isOrdered: false,
        _forcedType: "links",
      });
    }

    let result = sections.filter(s => s.paragraphs.length > 0);

    // Guard: if every paragraph across all sections is a special item (image/table/video/html)
    // with no plain text at all, the extractor grabbed the wrong root (e.g. a logo wrapper).
    // Retry against document.body so we get the actual article prose.
    if (result.length > 0 && root !== document.body) {
      const totalText = result.reduce((acc, s) => {
        return acc + s.paragraphs.filter(p => !isSpecialItem(p)).length;
      }, 0);
      if (totalText === 0) {
        console.warn("[NV] extractDOMSections: extracted root has no text paragraphs — retrying with document.body");
        return extractDOMSectionsFromRoot(document.body);
      }
    }

    // Pages with no headings → chunk into groups of 5
    if (result.length <= 1 && (result[0]?.paragraphs?.length || 0) > 5) {
      const allP = result[0]?.paragraphs || [];
      result = [];
      for (let i = 0; i < allP.length; i += 5) {
        result.push({ heading: "", level: 0, paragraphs: allP.slice(i, i + 5), isOrdered: false });
      }
    }

    // Fallback for div-only/SPA pages
    if (!result.length) {
      const { text } = NV.readabilityScorer.extractMainContent();
      if (text?.trim().length > 100) {
        const chunks = text.split(/\n{2,}/).map(t => t.replace(/\s+/g, " ").trim()).filter(t => t.length > 30);
        if (chunks.length) {
          for (let i = 0; i < chunks.length; i += 5) {
            result.push({ heading: "", level: 0, paragraphs: chunks.slice(i, i + 5), isOrdered: false });
          }
        } else {
          result.push({ heading: "", level: 0, paragraphs: [text.slice(0, 4000)], isOrdered: false });
        }
      }
    }

    return result;
  }

  // Outer entry point: picks the best root, then retries with body if the
  // chosen root yielded only media (no text) — preventing logo-only renders.
  function extractDOMSections() {
    const { element: mainEl } = NV.readabilityScorer.extractMainContent();
    const mainText = (mainEl?.innerText || "").trim();
    const root = (mainEl && mainText.split(/\s+/).length > 50) ? mainEl : document.body;
    return extractDOMSectionsFromRoot(root);
  }

  // ─── 2. LLM content string (text only) ───────────────────────────────────────
  function buildAnalysisContent(sections) {
    const lines = sections.map((s, i) => {
      const heading = s.heading || "(intro)";
      const textItems = s.paragraphs
        .filter(p => !isSpecialItem(p))
        .slice(0, 3)
        .map(p => p.slice(0, 250))
        .join(" ")
        .slice(0, 500);
      return `[${i}] ${heading}\n${textItems || "(media/table content)"}`;
    });
    let out = "";
    for (const line of lines) {
      if ((out + line).length > 7800) break;
      out += line + "\n\n";
    }
    return out.trim();
  }

  // ─── 2b. Build rich section hints for LLM (includes media/link signals) ─────
  function buildSectionHints(sections) {
    return sections.map((s, i) => {
      const heading   = s.heading || "(no heading)";
      const textItems = s.paragraphs.filter(p => !isSpecialItem(p)).slice(0, 3).map(p => p.slice(0, 200)).join(" ").slice(0, 400);
      const imgCount  = s.paragraphs.filter(p => p.startsWith(IMG_MARK)).length;
      const vidCount  = s.paragraphs.filter(p => p.startsWith(VID_MARK)).length;
      const hasLinks  = s.paragraphs.some(p => p.startsWith(HTML_MARK));
      const hasTbl    = s.paragraphs.some(p => p.startsWith(TBL_MARK));
      const flags     = [
        imgCount  && `${imgCount} image(s)`,
        vidCount  && `${vidCount} video(s)`,
        hasLinks  && "contains hyperlinks",
        hasTbl    && "has data table",
        s.isOrdered && "ordered list",
      ].filter(Boolean).join(", ");
      return `[${i}] "${heading}"${flags ? ` [${flags}]` : ""}\n${textItems || "(only media/links)"}`;
    }).join("\n\n");
  }

  // ─── 3. LLM classification ────────────────────────────────────────────────────
  async function analyzeWithLLM(sections, profiles) {
    const profileCtx = [
      profiles?.adhd     && "ADHD (needs clear chunking, scannable, no visual clutter, short paragraphs)",
      profiles?.autism   && "Autism (needs predictable layout, literal language, no sudden surprises)",
      profiles?.dyslexia && "Dyslexia (needs short paragraphs, clear headings, generous spacing)",
    ].filter(Boolean).join("; ") || "general reading difficulties";

    const n     = sections.length;
    const hints = buildSectionHints(sections);

    const prompt = `You are a web accessibility expert. A news/web page has been broken into ${n} sections.
Your job: classify each section so we can rebuild it in a clean, distraction-free reader layout for users with ${profileCtx}.

SECTIONS (index, heading, content signals, preview text):
${hints}

Return ONLY this JSON (no markdown, no explanation):
{
  "title": "short plain-language page title (max 10 words)",
  "page_type": "news|article|government|reference|product|documentation|other",
  "summary": "2-3 plain sentences describing what this page is about and who it helps",
  "quick_actions": ["main thing user can DO on this page", "second action if relevant"],
  "highlight_terms": ["key term 1","key term 2","key term 3","key term 4","key term 5"],
  "reading_level": "easy|medium|hard",
  "sections": [
    {
      "index": 0,
      "type": "hero|content|callout|warning|steps|faq|links|media",
      "importance": "high|medium|low",
      "complexity": 5,
      "plain_heading": "simpler plain-language heading",
      "skip": false
    }
  ]
}

TYPE RULES (pick the BEST match):
- "hero"    → page intro, article title, purpose statement
- "callout" → key notices, important facts, breaking news highlights, author byline, publication date
- "warning" → requirements, restrictions, deadlines, eligibility, legal notices
- "steps"   → numbered instructions, how-to, application process, ordered list
- "faq"     → Q&A, questions and answers
- "links"   → section mostly has links to other articles/pages (navigation, related articles, see-also)
- "media"   → section is mainly image(s) or video(s) with minimal text
- "content" → regular body text, news paragraphs, explanations

IMPORTANCE:
- "high"   → user must read this (article body, key info, warnings)
- "medium" → useful context (quotes, background)
- "low"    → supplementary, can be collapsed (footnotes, metadata, tag clouds)

SKIP RULE: set "skip": true for sections that are clearly promotional/ad filler:
- Short sections (under 30 words) with links to unrelated articles
- Sections whose text is just "Advertisement", "Promoted", "Sponsored content"
- Sections with only "Read more:" or "Also see:" followed by unrelated links
- Do NOT skip actual article content even if it contains links

COMPLEXITY: 1=very simple, 10=very technical/complex
MUST return exactly ${n} entries (index 0 to ${n - 1}). Return ONLY the JSON.`;

    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "NV_TRANSFORM_PAGE", payload: { prompt } },
        (r) => resolve(r || { success: false, error: "No response" })
      );
    });
    if (!resp.success) throw new Error(resp.error || "LLM failed");

    let raw = (resp.data || "").trim()
      .replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
    const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
    if (s !== -1 && e !== -1) raw = raw.slice(s, e + 1);

    try {
      const parsed = JSON.parse(raw);
      const byIdx = {};
      (parsed.sections || []).forEach(s => { byIdx[s.index] = s; });
      parsed.sections = Array.from({ length: n }, (_, i) =>
        byIdx[i] || {
          index: i,
          type: sections[i]?._forcedType || "content",
          importance: "medium",
          complexity: 5,
          plain_heading: sections[i]?.heading || "",
          skip: false,
        }
      );
      return parsed;
    } catch {
      return buildFallbackAnalysis(sections);
    }
  }

  function buildFallbackAnalysis(sections) {
    return {
      title: document.title || "This Page",
      page_type: "article",
      summary: "",
      quick_actions: [],
      highlight_terms: [],
      reading_level: "medium",
      sections: sections.map((s, i) => ({
        index: i,
        type: s._forcedType || "content",
        importance: "medium",
        complexity: 5,
        plain_heading: s.heading || "",
      })),
    };
  }

  // ─── 4. Functional page mode (accessibility overlay, no DOM replacement) ──────
  function renderFunctionalMode() {
    // Remove any previous NV overlay
    document.getElementById("nv-reader-overlay")?.remove();

    const banner = document.createElement("div");
    banner.id = "nv-reader-overlay";
    banner.className = "nv-functional-banner";

    banner.innerHTML = `
      <span class="nv-func-icon">🧠</span>
      <span class="nv-func-msg">
        <strong>NeuroVision</strong> — This is a functional page (forms/dashboard).
        Accessibility styles applied. Layout preserved.
      </span>
      <button class="nv-rm-exit-btn" id="nv-rm-exit" aria-label="Exit NeuroVision">✕ Exit</button>
    `;

    document.body.insertBefore(banner, document.body.firstChild);
    banner.querySelector("#nv-rm-exit")?.addEventListener("click", exitReaderMode);
    banner._keyHandler = e => { if (e.key === "Escape") exitReaderMode(); };
    document.addEventListener("keydown", banner._keyHandler);

    STATE.overlayEl      = banner;
    STATE.savedBodyStyle = document.body.getAttribute("style") || "";
    STATE.savedTitle     = document.title;
    STATE.active         = true;
    STATE.mode           = "functional";

    // Apply accessibility CSS directly to functional page
    applyFunctionalCSS();
    return banner;
  }

  function applyFunctionalCSS() {
    let style = document.getElementById("nv-functional-styles");
    if (!style) {
      style = document.createElement("style");
      style.id = "nv-functional-styles";
      document.head.appendChild(style);
    }
    style.textContent = `
      body { font-family: 'Lexend', -apple-system, sans-serif !important; }
      p, li, td, th, label, input, select, textarea, button {
        font-size: 15px !important; line-height: 1.7 !important;
      }
      input, select, textarea {
        padding: 8px 12px !important; border-radius: 6px !important;
        border: 2px solid #CBD5E1 !important;
      }
      input:focus, select:focus, textarea:focus, button:focus {
        outline: 3px solid #4A6FA5 !important; outline-offset: 2px !important;
        border-color: #4A6FA5 !important;
      }
      button, [type="submit"], [type="button"] {
        padding: 8px 18px !important; border-radius: 6px !important;
        cursor: pointer !important;
      }
      table { border-collapse: collapse !important; width: 100% !important; }
      th, td { padding: 8px 12px !important; border: 1px solid #E2E8F0 !important; }
      th { background: #F8FAFC !important; font-weight: 700 !important; }
      a { color: #2563EB !important; }
      h1,h2,h3,h4 { clear: both !important; }
    `;
  }

  // ─── 5. Content mode reader layout ───────────────────────────────────────────
  function renderReaderMode(domSections, analysis) {
    document.getElementById("nv-reader-overlay")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "nv-reader-overlay";
    overlay.setAttribute("role", "document");

    const metaMap = {};
    (analysis.sections || []).forEach(s => { metaMap[s.index] = s; });

    const terms  = (analysis.highlight_terms || []).filter(Boolean);
    const termRx = terms.length
      ? new RegExp(`\\b(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi")
      : null;

    function hl(text) {
      if (!termRx || !text) return escHtml(text);
      termRx.lastIndex = 0;
      return escHtml(text).replace(termRx, m => `<mark class="nv-rm-mark">${m}</mark>`);
    }

    const sidebar  = buildSidebar(domSections, analysis, metaMap);
    const mainHtml = domSections.map((sec, i) => {
      const meta = metaMap[i];
      if (meta?.skip) return ""; // LLM flagged as ad/promo filler
      return buildSectionHtml(sec, meta, i, hl);
    }).join("\n");
    const lvlClr   = { easy: "#059669", medium: "#D97706", hard: "#DC2626" };
    const lvlColor = lvlClr[analysis.reading_level] || lvlClr.medium;
    const typeLabel = (analysis.page_type || "article").replace(/_/g, " ");
    const isFallback = !analysis.summary;

    overlay.innerHTML = `
      <div class="nv-rm-toolbar">
        <div class="nv-rm-toolbar-left">
          <span class="nv-rm-logo">🧠</span>
          <span class="nv-rm-toolbar-title">NeuroVision Reader</span>
          <span class="nv-rm-page-type">${escHtml(typeLabel)}</span>
          <span class="nv-rm-shortcut-hint">Alt+R exit · Alt+T speak</span>
        </div>
        <div class="nv-rm-toolbar-right">
          ${isFallback
            ? `<span class="nv-rm-ai-status" id="nv-rm-ai-status">🔄 AI analyzing…</span>`
            : `<span class="nv-rm-stat" style="color:${lvlColor}">${(analysis.reading_level||"medium").toUpperCase()}</span>`
          }
          <button class="nv-rm-icon-btn" id="nv-rm-btn-tts" title="Text-to-Speech (Alt+T)" aria-label="Toggle TTS">🔊</button>
          <button class="nv-rm-icon-btn" id="nv-rm-btn-dark" title="Toggle dark mode" aria-label="Toggle dark mode">🌙</button>
          <button class="nv-rm-icon-btn" id="nv-rm-btn-focus" title="Focus View — hide sidebar" aria-label="Toggle Focus View">⊞</button>
          <button class="nv-rm-exit-btn" id="nv-rm-exit" aria-label="Exit reader mode">✕ Exit</button>
        </div>
      </div>

      <div class="nv-rm-tts-bar" id="nv-rm-tts-bar" role="status" aria-live="polite">
        <span>🔊</span>
        <span class="nv-rm-tts-text" id="nv-rm-tts-text">Speaking…</span>
        <button class="nv-rm-tts-stop" id="nv-rm-tts-stop">Stop</button>
      </div>

      <div class="nv-rm-progress-bar" id="nv-rm-progress" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
        <div class="nv-rm-progress-fill" id="nv-rm-progress-fill"></div>
      </div>

      <div class="nv-rm-layout">
        <aside class="nv-rm-sidebar" id="nv-rm-sidebar">${sidebar}</aside>
        <main class="nv-rm-main" id="nv-rm-main">
          ${mainHtml || "<p class='nv-rm-empty'>No content sections found.</p>"}
        </main>
      </div>`;

    // Replace body content
    STATE.savedChildren  = Array.from(document.body.childNodes)
      .filter(n => n.id !== "nv-transform-loading" && n.id !== "nv-reader-overlay");
    STATE.savedBodyStyle = document.body.getAttribute("style") || "";
    STATE.savedTitle     = document.title;

    while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
    // IMPORTANT: do NOT set overflow-x:hidden on body — it kills position:sticky
    // overflow-x is controlled on #nv-reader-overlay itself via overflow-x:clip
    document.body.setAttribute("style", "margin:0;padding:0;background:#F1F5F9;");
    document.body.appendChild(overlay);

    if (analysis.title) document.title = `[Reader] ${analysis.title}`;
    STATE.overlayEl = overlay;
    STATE.mode = "content";

    overlay.querySelector("#nv-rm-exit")?.addEventListener("click", exitReaderMode);

    // TTS button
    overlay.querySelector("#nv-rm-btn-tts")?.addEventListener("click", () => {
      if (NV.tts) NV.tts.toggleSpeaking();
    });
    overlay.querySelector("#nv-rm-tts-stop")?.addEventListener("click", () => {
      if (NV.tts) NV.tts.stopSpeaking();
    });

    // Dark mode toggle
    overlay.querySelector("#nv-rm-btn-dark")?.addEventListener("click", () => {
      const btn = overlay.querySelector("#nv-rm-btn-dark");
      const isDark = overlay.classList.toggle("nv-rm-dark");
      btn.classList.toggle("active", isDark);
      btn.title = isDark ? "Switch to light mode" : "Toggle dark mode";
      document.body.style.background = isDark ? "#0F172A" : "#F1F5F9";
    });

    // Focus View toggle (hide sidebar)
    overlay.querySelector("#nv-rm-btn-focus")?.addEventListener("click", () => {
      const btn = overlay.querySelector("#nv-rm-btn-focus");
      const isFocus = overlay.classList.toggle("nv-rm-focus-view");
      btn.classList.toggle("active", isFocus);
      btn.title = isFocus ? "Show sidebar" : "Focus View — hide sidebar";
    });

    // Progress bar
    const fillEl = overlay.querySelector("#nv-rm-progress-fill");
    const progEl = overlay.querySelector("#nv-rm-progress");
    STATE._progressListener = () => {
      const pct = Math.round(window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight) * 100);
      if (fillEl) fillEl.style.width = pct + "%";
      if (progEl) progEl.setAttribute("aria-valuenow", pct);
    };
    window.addEventListener("scroll", STATE._progressListener, { passive: true });

    // TOC clicks
    overlay.querySelectorAll(".nv-rm-toc-link").forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();
        const target = document.querySelector(link.getAttribute("href"));
        if (!target) return;
        if (target.tagName === "DETAILS") target.open = true;
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 56, behavior: "smooth" });
      });
    });

    overlay._keyHandler = e => { if (e.key === "Escape") exitReaderMode(); };
    document.addEventListener("keydown", overlay._keyHandler);

    setupScrollSpy();
    STATE.active = true;
    return overlay;
  }

  // ─── 6. Background LLM enhancement ───────────────────────────────────────────
  async function enhanceWithLLMAsync(domSections, profiles, url, snippet) {
    try {
      const analysis = await analyzeWithLLM(domSections, profiles);
      try { await NV.cache.set(url, snippet, analysis); } catch { /* ok */ }
      STATE.analysis = analysis;

      if (!STATE.active || STATE.mode !== "content") return;

      enhanceRenderedSections(domSections, analysis);

      const sidebarEl = document.getElementById("nv-rm-sidebar");
      if (sidebarEl) {
        const metaMap = {};
        (analysis.sections || []).forEach(s => { metaMap[s.index] = s; });
        sidebarEl.innerHTML = buildSidebar(domSections, analysis, metaMap);
        sidebarEl.querySelectorAll(".nv-rm-toc-link").forEach(link => {
          link.addEventListener("click", e => {
            e.preventDefault();
            const target = document.querySelector(link.getAttribute("href"));
            if (!target) return;
            if (target.tagName === "DETAILS") target.open = true;
            window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 56, behavior: "smooth" });
          });
        });
      }

      if (STATE._observer) { STATE._observer.disconnect(); STATE._observer = null; }
      setupScrollSpy();

      const aiStatus = document.getElementById("nv-rm-ai-status");
      if (aiStatus) {
        const lvlClr = { easy: "#059669", medium: "#D97706", hard: "#DC2626" };
        const clr = lvlClr[analysis.reading_level] || lvlClr.medium;
        aiStatus.outerHTML = `<span class="nv-rm-stat" style="color:${clr}">${(analysis.reading_level||"medium").toUpperCase()}</span>`;
      }
    } catch (err) {
      const aiStatus = document.getElementById("nv-rm-ai-status");
      if (aiStatus) { aiStatus.textContent = "⚠️ AI unavailable"; aiStatus.style.color = "#F59E0B"; }
    }
  }

  function enhanceRenderedSections(domSections, analysis) {
    const metaMap = {};
    (analysis.sections || []).forEach(s => { metaMap[s.index] = s; });

    const terms  = (analysis.highlight_terms || []).filter(Boolean);
    const termRx = terms.length
      ? new RegExp(`\\b(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi")
      : null;
    function hl(t) {
      if (!termRx || !t) return escHtml(t);
      termRx.lastIndex = 0;
      return escHtml(t).replace(termRx, m => `<mark class="nv-rm-mark">${m}</mark>`);
    }

    domSections.forEach((sec, i) => {
      const meta = metaMap[i];
      if (!meta) return;
      const el = document.getElementById(`nv-sec-${i}`);
      if (!el) return;

      const type       = meta.type       || "content";
      const importance = meta.importance || "medium";
      const complexity = Math.min(10, Math.max(1, meta.complexity || 5));
      const cfg        = TYPE_CFG[type] || TYPE_CFG.content;
      const heading    = meta.plain_heading || sec.heading || "";

      el.className = el.className
        .replace(/nv-rm-type-\w+/g, `nv-rm-type-${type}`)
        .replace(/nv-rm-imp-\w+/g, `nv-rm-imp-${importance}`);

      const badge = el.querySelector(".nv-rm-sec-badge");
      if (badge) { badge.style.background = cfg.accent; badge.textContent = `${cfg.icon} ${cfg.label}`; }

      const bars = el.querySelector(".nv-rm-complexity");
      if (bars) {
        bars.innerHTML = Array.from({ length: 10 }, (_, j) =>
          `<span class="nv-rm-bar${j < complexity ? " filled" : ""}"></span>`
        ).join("");
      }

      const h = el.querySelector(".nv-rm-sec-heading");
      if (h && heading) h.textContent = heading;

      // Collapse low-importance sections that are currently <section>
      if (importance === "low" && el.tagName === "SECTION") {
        const details = document.createElement("details");
        details.id = el.id;
        details.className = `nv-rm-section nv-rm-type-${type} nv-rm-imp-low`;
        details.innerHTML = `<summary class="nv-rm-sec-summary">
          <span>${cfg.icon}</span><span>${escHtml(heading || cfg.label)}</span>
          <span class="nv-rm-sec-badge nv-rm-badge-sm" style="background:${cfg.accent}">${cfg.label}</span>
        </summary>`;
        const body = el.querySelector(".nv-rm-sec-body");
        if (body) details.appendChild(body.cloneNode(true));
        el.parentNode.replaceChild(details, el);
      }
    });
  }

  // ─── Sidebar ──────────────────────────────────────────────────────────────────
  function buildSidebar(domSections, analysis, metaMap) {
    const summaryHtml = analysis.summary
      ? `<div class="nv-rm-sb-block">
           <div class="nv-rm-sb-title">📌 Summary</div>
           <p class="nv-rm-sb-summary">${escHtml(analysis.summary)}</p>
         </div>` : "";

    const actions = (analysis.quick_actions || []).filter(Boolean);
    const actionsHtml = actions.length
      ? `<div class="nv-rm-sb-block">
           <div class="nv-rm-sb-title">⚡ Key Actions</div>
           ${actions.map(a => `<div class="nv-rm-quick-action">${escHtml(a)}</div>`).join("")}
         </div>` : "";

    const tocItems = domSections.map((sec, i) => {
      const meta    = metaMap[i] || {};
      const heading = meta.plain_heading || sec.heading;
      if (!heading) return "";
      const imp = meta.importance || "medium";
      const cfg = TYPE_CFG[meta.type] || TYPE_CFG.content;
      return `<a class="nv-rm-toc-link nv-rm-toc-${imp}" href="#nv-sec-${i}" role="listitem">
                <span class="nv-rm-toc-icon">${cfg.icon}</span>
                <span class="nv-rm-toc-text">${escHtml(heading.slice(0, 60))}</span>
              </a>`;
    }).filter(Boolean).join("");

    const tocHtml = tocItems
      ? `<div class="nv-rm-sb-block nv-rm-toc-block">
           <div class="nv-rm-sb-title">📑 Contents</div>
           <nav class="nv-rm-toc" role="list">${tocItems}</nav>
         </div>` : "";

    const terms = (analysis.highlight_terms || []).filter(Boolean);
    const termsHtml = terms.length
      ? `<div class="nv-rm-sb-block">
           <div class="nv-rm-sb-title">🔑 Key Terms</div>
           <div class="nv-rm-chips">${terms.map(t => `<span class="nv-rm-chip">${escHtml(t)}</span>`).join("")}</div>
         </div>` : "";

    const highCount = Object.values(metaMap).filter(m => m.importance === "high").length;
    const statsHtml = `<div class="nv-rm-sb-block">
      <div class="nv-rm-sb-stats">
        ${highCount ? `<span class="nv-rm-stat-pill nv-rm-stat-high">${highCount} must-read</span>` : ""}
        <span class="nv-rm-stat-pill">${domSections.length} sections</span>
      </div></div>`;

    return summaryHtml + actionsHtml + statsHtml + tocHtml + termsHtml;
  }

  // ─── Section HTML ─────────────────────────────────────────────────────────────
  function buildSectionHtml(sec, meta, i, hl) {
    const type       = meta?.type       || sec._forcedType || "content";
    const importance = meta?.importance || "medium";
    const complexity = Math.min(10, Math.max(1, meta?.complexity || 5));
    const cfg        = TYPE_CFG[type] || TYPE_CFG.content;
    const heading    = meta?.plain_heading || sec.heading || "";

    const bars = Array.from({ length: 10 }, (_, j) =>
      `<span class="nv-rm-bar${j < complexity ? " filled" : ""}"></span>`
    ).join("");

    const headingHtml = heading
      ? `<h2 class="nv-rm-sec-heading" id="nv-sec-${i}-h">${escHtml(heading)}</h2>` : "";

    const inner = `
      <div class="nv-rm-sec-header">
        <div class="nv-rm-sec-meta">
          <span class="nv-rm-sec-badge" style="background:${cfg.accent}">${cfg.icon} ${cfg.label}</span>
          <span class="nv-rm-complexity" title="Complexity ${complexity}/10">${bars}</span>
        </div>
        ${headingHtml}
      </div>
      <div class="nv-rm-sec-body">${renderSectionBody(sec, type, hl)}</div>`;

    if (importance === "low") {
      return `
        <details class="nv-rm-section nv-rm-type-${type} nv-rm-imp-low" id="nv-sec-${i}">
          <summary class="nv-rm-sec-summary">
            <span>${cfg.icon}</span>
            <span>${escHtml(heading || cfg.label)}</span>
            <span class="nv-rm-sec-badge nv-rm-badge-sm" style="background:${cfg.accent}">${cfg.label}</span>
          </summary>
          <div class="nv-rm-sec-body">${renderSectionBody(sec, type, hl)}</div>
        </details>`;
    }

    return `
      <section class="nv-rm-section nv-rm-type-${type} nv-rm-imp-${importance}"
               id="nv-sec-${i}" aria-labelledby="nv-sec-${i}-h">
        ${inner}
      </section>`;
  }

  // ─── Section body ─────────────────────────────────────────────────────────────
  function renderSectionBody(sec, type, hl) {
    if (type === "steps" || sec.isOrdered) {
      const stepItems = sec.paragraphs.filter(p => !isSpecialItem(p));
      const extras    = sec.paragraphs.filter(isSpecialItem).map(renderSpecialItem).join("");
      const steps     = stepItems.map((p, j) => `
        <li class="nv-rm-step-item">
          <span class="nv-rm-step-num">${j + 1}</span>
          <span class="nv-rm-step-text">${hl(p)}</span>
        </li>`).join("");
      return `<ol class="nv-rm-steps-list">${steps}</ol>${extras}`;
    }

    if (type === "faq") {
      return sec.paragraphs.filter(p => !isSpecialItem(p)).map((p, j) => {
        const isQ = j % 2 === 0;
        return `<p class="nv-rm-para nv-rm-para-${isQ ? "question" : "answer"}">${hl(p)}</p>`;
      }).join("");
    }

    // Links section: render HTML_MARK items as styled pill links
    if (type === "links") {
      return sec.paragraphs.map(p => {
        if (p.startsWith(HTML_MARK)) return renderLinksItem(p.slice(HTML_MARK.length));
        if (isSpecialItem(p)) return renderSpecialItem(p);
        return `<p class="nv-rm-para">${hl(p)}</p>`;
      }).join("");
    }

    // Default: mixed content — text paragraphs interspersed with media
    return sec.paragraphs.map(p => {
      if (isSpecialItem(p)) return renderSpecialItem(p);
      // Paragraphs that contain links: render with inline related styling
      if (p.startsWith(HTML_MARK)) {
        const inner = p.slice(HTML_MARK.length);
        // If the HTML is almost entirely links (short text, just a link) show as related pill
        const stripped = inner.replace(/<[^>]+>/g, "").trim();
        if (stripped.length < 120 && inner.includes("<a ")) {
          return renderLinksItem(inner);
        }
        return `<p class="nv-rm-para nv-rm-para-html">${inner}</p>`;
      }
      return `<p class="nv-rm-para">${hl(p)}</p>`;
    }).join("");
  }

  // Render a links block — extracts <a> tags and shows each as a pill
  function renderLinksItem(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    const links = Array.from(div.querySelectorAll("a[href]"));
    if (!links.length) {
      // No actual links, just render as paragraph
      return `<p class="nv-rm-para nv-rm-para-html">${html}</p>`;
    }
    // Render each link as a styled pill card
    return links.map(a => {
      const href = a.getAttribute("href") || "#";
      const text = (a.innerText || a.textContent || "").trim();
      if (!text || text.length < 3) return "";
      return `<a href="${escAttr(href)}" target="_blank" rel="noopener noreferrer"
                 class="nv-rm-related-link">${escHtml(text)}</a>`;
    }).join("");
  }

  // ─── Special item renderers ───────────────────────────────────────────────────
  function renderSpecialItem(p) {
    if (p.startsWith(IMG_MARK))  return renderImage(p.slice(IMG_MARK.length));
    if (p.startsWith(TBL_MARK))  return renderTable(p.slice(TBL_MARK.length));
    if (p.startsWith(HTML_MARK)) return `<p class="nv-rm-para nv-rm-para-html">${p.slice(HTML_MARK.length)}</p>`;
    if (p.startsWith(VID_MARK))  return renderVideo(p.slice(VID_MARK.length));
    return "";
  }

  function renderImage(data) {
    const pipeIdx = data.indexOf("|");
    const src = pipeIdx >= 0 ? data.slice(0, pipeIdx) : data;
    const alt = pipeIdx >= 0 ? data.slice(pipeIdx + 1) : "";
    if (!src) return "";
    return `
      <figure class="nv-rm-figure">
        <img src="${escAttr(src)}" alt="${escAttr(alt)}" class="nv-rm-img" loading="lazy"
             onerror="this.closest('.nv-rm-figure').style.display='none'">
        ${alt ? `<figcaption class="nv-rm-figcaption">${escHtml(alt)}</figcaption>` : ""}
      </figure>`;
  }

  function renderVideo(data) {
    const parts = data.split("|");
    const src   = parts[0] || "";
    const title = parts[1] || "Video";
    const type  = parts[2] || "youtube";
    if (!src) return "";

    if (type === "native") {
      return `
        <div class="nv-rm-video-wrap">
          <video class="nv-rm-video" controls preload="metadata" title="${escAttr(title)}">
            <source src="${escAttr(src)}">
            Your browser doesn't support video.
          </video>
          ${title ? `<p class="nv-rm-video-caption">${escHtml(title)}</p>` : ""}
        </div>`;
    }

    // YouTube / Vimeo embed - needs sandbox to work
    return `
      <div class="nv-rm-video-wrap">
        <div class="nv-rm-video-embed-wrap">
          <iframe class="nv-rm-video-embed"
            src="${escAttr(src)}"
            title="${escAttr(title)}"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            loading="lazy">
          </iframe>
        </div>
        ${title !== "Video" ? `<p class="nv-rm-video-caption">${escHtml(title)}</p>` : ""}
      </div>`;
  }

  function renderTable(data) {
    const pipeIdx = data.lastIndexOf("|");
    const html    = pipeIdx >= 0 ? data.slice(0, pipeIdx) : data;
    const caption = pipeIdx >= 0 ? data.slice(pipeIdx + 1) : "";
    return `
      <div class="nv-rm-table-wrap">
        ${caption ? `<p class="nv-rm-table-caption">${escHtml(caption)}</p>` : ""}
        <div class="nv-rm-table-scroll">${html}</div>
      </div>`;
  }

  // ─── Scroll spy ───────────────────────────────────────────────────────────────
  function setupScrollSpy() {
    const sections = document.querySelectorAll(".nv-rm-section[id], details.nv-rm-section[id]");
    const links    = document.querySelectorAll(".nv-rm-toc-link");
    if (!sections.length || !links.length) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        links.forEach(l => l.classList.toggle("active", l.getAttribute("href") === `#${id}`));
      });
    }, { root: null, threshold: 0.15, rootMargin: "-52px 0px 0px 0px" });
    sections.forEach(s => observer.observe(s));
    STATE._observer = observer;
  }

  // ─── Exit ─────────────────────────────────────────────────────────────────────
  function exitReaderMode() {
    if (!STATE.active) return;
    STATE.active = false;

    if (STATE.overlayEl?._keyHandler) document.removeEventListener("keydown", STATE.overlayEl._keyHandler);
    if (STATE._progressListener) { window.removeEventListener("scroll", STATE._progressListener); STATE._progressListener = null; }
    if (STATE._observer) { STATE._observer.disconnect(); STATE._observer = null; }

    STATE.overlayEl?.remove();
    STATE.overlayEl = null;

    if (STATE.mode === "functional") {
      document.getElementById("nv-functional-styles")?.remove();
      if (STATE.savedBodyStyle) document.body.setAttribute("style", STATE.savedBodyStyle);
      else document.body.removeAttribute("style");
    } else {
      if (STATE.savedBodyStyle) document.body.setAttribute("style", STATE.savedBodyStyle);
      else document.body.removeAttribute("style");
      if (STATE.savedChildren) {
        STATE.savedChildren.forEach(n => document.body.appendChild(n));
        STATE.savedChildren = null;
      }
    }
    if (STATE.savedTitle) document.title = STATE.savedTitle;
    STATE.mode = "content";
  }

  // ─── Main entry ───────────────────────────────────────────────────────────────
  async function transformPage(settings, onProgress) {
    STATE.onProgress = onProgress || (() => {});
    const profiles = settings?.profiles || {};
    const url      = window.location.href;

    onProgress(5, 100, "Analyzing page…");

    // ── Functional page: lightweight mode ─────────────────────────────────────
    if (isFunctionalPage()) {
      onProgress(90, 100, "Applying accessibility styles…");
      renderFunctionalMode();
      onProgress(100, 100, "Accessibility styles applied.");
      return buildFallbackAnalysis([]);
    }

    // ── Content page: full reader mode ────────────────────────────────────────
    onProgress(10, 100, "Extracting page content…");
    const domSections = extractDOMSections();
    if (!domSections.length) throw new Error("No readable content found on this page.");

    const snippet = domSections.slice(0, 4)
      .map(s => (s.heading || "") + (s.paragraphs.find(p => !isSpecialItem(p)) || "").slice(0, 80))
      .join("|");

    onProgress(20, 100, "Checking cache…");
    let cachedAnalysis = null;
    try { cachedAnalysis = await NV.cache.get(url, snippet); } catch { /* ok */ }

    onProgress(85, 100, "Building reader layout…");
    const initial = cachedAnalysis || buildFallbackAnalysis(domSections);
    renderReaderMode(domSections, initial);
    onProgress(100, 100, "Content ready!");

    STATE.analysis = initial;

    // Background LLM enhancement (non-blocking)
    if (!cachedAnalysis) {
      setTimeout(() => enhanceWithLLMAsync(domSections, profiles, url, snippet), 150);
    }

    return initial;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function escHtml(str) {
    return (str || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escAttr(str) {
    return (str || "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // ─── Public API ──────────────────────────────────────────────────────────────
  NV.pageTransformer = {
    transformPage,
    exitReaderMode,
    extractDOMSections,
    isActive:    () => STATE.active,
    getAnalysis: () => STATE.analysis,
  };
})();
