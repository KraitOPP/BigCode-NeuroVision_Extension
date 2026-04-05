/**
 * NeuroVision — Apply AI results (simplify, summary, concepts) to the live page DOM.
 */
(function () {
  "use strict";

  const NV = (window.NeuroVision = window.NeuroVision || {});

  function injectPageStyles() {
    if (document.getElementById("nv-page-apply-styles")) return;
    const style = document.createElement("style");
    style.id = "nv-page-apply-styles";
    style.textContent = `
      #nv-summary-card {
        margin: 20px 0 24px;
        background: #F0F7FF;
        border: 1.5px solid #4A6FA5;
        border-radius: 10px;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        max-width: 680px;
      }
      .nv-sc-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        background: #4A6FA5;
        color: white;
      }
      .nv-sc-icon { font-size: 16px; }
      .nv-sc-title { font-weight: 700; font-size: 13px; letter-spacing: 0.04em; flex: 1; min-width: 0; text-transform: uppercase; }
      .nv-sc-close {
        background: none; border: none; color: rgba(255,255,255,0.7);
        cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: 4px;
      }
      .nv-sc-close:hover { background: rgba(0,0,0,0.15); color: white; }
      .nv-sc-list {
        margin: 0; padding: 12px 18px 12px 34px;
        list-style: disc;
        font-size: 14px; line-height: 1.8; color: #1E293B;
      }
      .nv-sc-list li { margin-bottom: 4px; }
      .nv-sc-live {
        flex-shrink: 0;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        opacity: 0.95;
        animation: nv-sc-pulse 1.2s ease-in-out infinite;
      }
      @keyframes nv-sc-pulse {
        0%, 100% { opacity: 0.75; }
        50% { opacity: 1; }
      }
      .nv-sc-list-live {
        max-height: min(45vh, 280px);
        overflow-y: auto;
        scroll-behavior: smooth;
      }
      .nv-li-just-added {
        animation: nv-li-in 0.55s ease;
      }
      @keyframes nv-li-in {
        from { opacity: 0; transform: translateX(-8px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes nv-para-flash {
        0% { box-shadow: 0 0 0 0 rgba(96, 165, 250, 0); background-color: transparent; }
        35% { box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.35); background-color: rgba(239, 246, 255, 0.9); }
        100% { box-shadow: 0 0 0 0 rgba(96, 165, 250, 0); background-color: transparent; }
      }
      p.nv-para-live-flash {
        border-radius: 6px;
        animation: nv-para-flash 0.95s ease;
      }
    `;
    document.head.appendChild(style);
  }

  function applyToPage(action, content) {
    if (action === "simplify") {
      applySimplifyToPage(typeof content === "string" ? content : "");
    } else if (action === "summarize") {
      applySummaryToPage(typeof content === "string" ? content : "");
    } else if (action === "concepts") {
      const keywords = typeof content === "string"
        ? content.split(",").map((k) => k.trim()).filter(Boolean)
        : (Array.isArray(content) ? content : []);
      applyConceptsToPage(keywords);
    }
  }

  function clearSimplificationsInElement(root) {
    if (!root) return;
    root.querySelectorAll("[data-nv-simplified]").forEach((el) => {
      el.textContent = el.getAttribute("data-nv-original");
      el.removeAttribute("data-nv-original");
      el.removeAttribute("data-nv-simplified");
    });
  }

  function applySimplifyToOneParagraph(para, simplifiedText, opts) {
    if (!para || !simplifiedText) return;
    const chunk = simplifiedText.trim();
    if (!chunk) return;
    para.setAttribute("data-nv-original", para.textContent);
    para.setAttribute("data-nv-simplified", "true");
    para.innerHTML = `${chunk} <button class="nv-restore-btn" aria-label="Restore original" title="Show original">↩</button>`;
    para.querySelector(".nv-restore-btn")?.addEventListener("click", () => {
      para.textContent = para.getAttribute("data-nv-original");
      para.removeAttribute("data-nv-original");
      para.removeAttribute("data-nv-simplified");
    });
    if (opts?.flash) {
      para.classList.remove("nv-para-live-flash");
      void para.offsetWidth;
      para.classList.add("nv-para-live-flash");
      setTimeout(() => para.classList.remove("nv-para-live-flash"), 1000);
    }
  }

  function applySimplifyToPage(simplifiedText) {
    if (!simplifiedText) return;
    const { element: mainEl } = NV.readabilityScorer.extractMainContent();
    if (!mainEl) return;

    clearSimplificationsInElement(mainEl);

    const paras = Array.from(mainEl.querySelectorAll("p")).filter(
      (p) => (p.innerText || "").split(/\s+/).length > 15
    );
    if (!paras.length) return;

    const sentences = simplifiedText
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const perPara = Math.max(1, Math.ceil(sentences.length / paras.length));
    paras.forEach((para, i) => {
      const chunk = sentences.slice(i * perPara, (i + 1) * perPara).join(" ");
      if (!chunk) return;
      applySimplifyToOneParagraph(para, chunk);
    });
  }

  function applySummaryToPage(summaryText) {
    if (!summaryText) return;
    document.getElementById("nv-summary-card")?.remove();

    const { element: mainEl } = NV.readabilityScorer.extractMainContent();
    const insertBefore = mainEl?.querySelector("p") || mainEl || document.body.querySelector("article p, main p");
    if (!insertBefore?.parentNode) return;

    const card = document.createElement("div");
    card.id = "nv-summary-card";
    card.setAttribute("role", "note");
    card.setAttribute("aria-label", "AI Summary");

    const bullets = summaryText
      .split("\n")
      .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
      .filter(Boolean);

    card.innerHTML = `
      <div class="nv-sc-header">
        <span class="nv-sc-icon" aria-hidden="true">📋</span>
        <span class="nv-sc-title">Summary</span>
        <button class="nv-sc-close" aria-label="Remove summary">✕</button>
      </div>
      <ul class="nv-sc-list">${bullets.map((b) => `<li>${b}</li>`).join("")}</ul>
    `;
    card.querySelector(".nv-sc-close").addEventListener("click", () => card.remove());
    insertBefore.parentNode.insertBefore(card, insertBefore);
  }

  function ensureLiveSummaryCard() {
    document.getElementById("nv-summary-card")?.remove();

    const { element: mainEl } = NV.readabilityScorer.extractMainContent();
    const insertBefore = mainEl?.querySelector("p") || mainEl || document.body.querySelector("article p, main p");
    if (!insertBefore?.parentNode) return null;

    const card = document.createElement("div");
    card.id = "nv-summary-card";
    card.setAttribute("data-nv-live", "1");
    card.setAttribute("role", "note");
    card.setAttribute("aria-label", "AI Summary");
    card.innerHTML = `
      <div class="nv-sc-header">
        <span class="nv-sc-icon" aria-hidden="true">📋</span>
        <span class="nv-sc-title">Summary</span>
        <span class="nv-sc-live">Live</span>
        <button class="nv-sc-close" aria-label="Remove summary">✕</button>
      </div>
      <ul class="nv-sc-list nv-sc-list-live"></ul>
    `;
    card.querySelector(".nv-sc-close").addEventListener("click", () => card.remove());
    insertBefore.parentNode.insertBefore(card, insertBefore);
    return card;
  }

  function appendSummaryBulletsIncremental(summaryText, seenSet) {
    const ul = document.querySelector("#nv-summary-card .nv-sc-list");
    if (!ul || !seenSet) return 0;
    let added = 0;
    for (const line of String(summaryText).split("\n")) {
      const raw = line.replace(/^[•\-*]\s*/, "").trim();
      if (raw.length < 6) continue;
      const key = raw.toLowerCase();
      if (seenSet.has(key)) continue;
      seenSet.add(key);
      const li = document.createElement("li");
      li.textContent = raw;
      li.classList.add("nv-li-just-added");
      ul.appendChild(li);
      setTimeout(() => li.classList.remove("nv-li-just-added"), 600);
      added++;
    }
    ul.scrollTop = ul.scrollHeight;
    return added;
  }

  function finalizeLiveSummaryCard() {
    const card = document.getElementById("nv-summary-card");
    if (!card) return;
    card.removeAttribute("data-nv-live");
    card.querySelector(".nv-sc-live")?.remove();
    card.querySelector(".nv-sc-list")?.classList.remove("nv-sc-list-live");
  }

  function applyConceptsToPage(keywords) {
    if (!keywords.length) return;
    NV.adhd.highlightKeywords(keywords);
  }

  async function handleAndApply(action, payload, sendResponse) {
    const S = NV.contentState;
    try {
      const text = (payload.text && payload.text.trim())
        ? payload.text
        : (S.metrics?.mainText || "").slice(0, action === "keywords" ? 2000 : 4000);

      if (!text) { sendResponse({ success: false, error: "No text" }); return; }

      let result = "";
      if (action === "simplify") {
        result = await NV.ollama.simplifyText(text, payload.targetGrade || S.settings?.llm?.targetGrade || 8);
      } else if (action === "summarize") {
        result = await NV.ollama.summarizeText(text);
      } else if (action === "keywords") {
        const keywords = await NV.ollama.extractKeywords(text);
        result = keywords;
      }

      injectPageStyles();
      applyToPage(action === "keywords" ? "concepts" : action, result);
      sendResponse({ success: true, data: result });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  }

  NV.contentPageApply = {
    injectPageStyles,
    applyToPage,
    handleAndApply,
    clearSimplificationsInElement,
    applySimplifyToOneParagraph,
    applySimplifyToPage,
    applySummaryToPage,
    ensureLiveSummaryCard,
    appendSummaryBulletsIncremental,
    finalizeLiveSummaryCard,
  };
})();
