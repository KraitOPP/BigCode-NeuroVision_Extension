/**
 * NeuroVision — Popup: AI actions, page text extraction, reader transform.
 */
(function () {
  "use strict";

  const p = window.NVPopup;

  /** Matches manifest.json content_scripts order for programmatic injection. */
  p.CONTENT_SCRIPT_FILES = [
    "utils/algorithms.js",
    "utils/storage.js",
    "utils/messaging.js",
    "utils/cache.js",
    "utils/config.js",
    "content/modules/ReadabilityScorer.js",
    "content/modules/DOMAnalyzer.js",
    "content/modules/OllamaClient.js",
    "content/modules/TTSModule.js",
    "content/modules/ADHDModule.js",
    "content/modules/AutismModule.js",
    "content/modules/DyslexiaModule.js",
    "content/modules/PageTransformer.js",
    "content/modules/ContentState.js",
    "content/modules/ContentAiPanel.js",
    "content/modules/ContentLoadingOverlay.js",
    "content/modules/ContentPageApply.js",
    "content/modules/ContentAsyncApply.js",
    "content/modules/ContentOrchestrator.js",
    "content/modules/ContentTransform.js",
    "content/modules/ContentMessaging.js",
    "content/content.js",
  ];

  p.CONTENT_STYLE_FILES = [
    "styles/base.css",
    "styles/adhd.css",
    "styles/autism.css",
    "styles/dyslexia.css",
    "styles/reader-mode.css",
  ];

  p.runAI = async function runAI(action) {
    if (!p.activeTab?.id) return;

    const outputEl = p.$("ai-output");
    const bodyEl = p.$("ai-output-body");
    const titleEl = p.$("ai-output-title");
    const buttons = document.querySelectorAll(".nv-ai-btn");

    const titles = { simplify: "✏️ Simplified Text", summarize: "📋 Summary", keywords: "🔑 Key Concepts" };

    if (action === "simplify" || action === "summarize") {
      const ping = await p.sendToTab(p.activeTab.id, p.MSG.GET_PAGE_METRICS);
      if (!ping?.success) {
        buttons.forEach((b) => b.classList.add("loading"));
        outputEl.hidden = false;
        bodyEl.textContent = "Refresh the page or open a normal article tab, then try again.";
        titleEl.textContent = titles[action];
        buttons.forEach((b) => b.classList.remove("loading"));
        return;
      }

      const msgType = action === "simplify" ? p.MSG.SIMPLIFY_PAGE_START : p.MSG.SUMMARIZE_PAGE_START;
      const payload = {};
      if (action === "simplify") payload.targetGrade = p.settings?.llm?.targetGrade ?? 8;

      chrome.tabs.sendMessage(p.activeTab.id, { type: msgType, payload }, () => { void chrome.runtime.lastError; });
      window.close();
      return;
    }

    buttons.forEach((b) => b.classList.add("loading"));
    outputEl.hidden = false;
    bodyEl.textContent = "Working…";
    titleEl.textContent = titles[action] || "AI Result";

    try {
      const pageText = await p.getPageText();
      if (!pageText) {
        bodyEl.textContent = "Could not read page content. Try refreshing the page.";
        return;
      }

      const msgType = p.MSG.EXTRACT_KEYWORDS;
      const payload = { text: pageText };

      bodyEl.textContent = "Result will appear on the page…";

      const resp = await p.sendToTab(p.activeTab.id, msgType, payload);

      if (resp?.success) {
        bodyEl.textContent = "✅ Result shown on page (bottom-right panel)";
      } else {
        const errMsg = resp?.error || "unknown error";
        bodyEl.textContent = errMsg.includes("fetch") || errMsg.includes("CORS")
          ? `Ollama not reachable.\n\nFix: run start_ollama.bat then reload the extension.`
          : `Error: ${errMsg}`;
      }
    } catch (err) {
      bodyEl.textContent = `Error: ${err.message}`;
    } finally {
      buttons.forEach((b) => b.classList.remove("loading"));
    }
  };

  p.getPageText = async function getPageText() {
    const metricsResp = await p.sendToTab(p.activeTab.id, "NV_GET_PAGE_METRICS");
    if (metricsResp?.success && metricsResp.data?.mainText) {
      p.metrics = metricsResp.data;
      p.renderMetrics(p.metrics);
      return metricsResp.data.mainText;
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: p.activeTab.id },
        func: () => {
          const selectors = ["article", "main", '[role="main"]', ".post-content", ".article-body", "body"];
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) {
              const text = (el.innerText || "").trim();
              if (text.length > 200) return text.slice(0, 8000);
            }
          }
          return (document.body.innerText || "").slice(0, 8000);
        },
      });
      return results?.[0]?.result || "";
    } catch {
      return "";
    }
  };

  p.runTransform = async function runTransform() {
    if (!p.activeTab?.id) return;

    const btn = p.$("btn-transform");

    const ping = await p.sendToTab(p.activeTab.id, p.MSG.GET_PAGE_METRICS);

    if (!ping?.success) {
      if (btn) { btn.textContent = "⏳ Injecting…"; btn.disabled = true; }
      try {
        await chrome.scripting.executeScript({
          target: { tabId: p.activeTab.id },
          files: p.CONTENT_SCRIPT_FILES,
        });
        await chrome.scripting.insertCSS({
          target: { tabId: p.activeTab.id },
          files: p.CONTENT_STYLE_FILES,
        });
        await new Promise((r) => setTimeout(r, 400));
      } catch {
        if (btn) { btn.textContent = "⚠️ Refresh page first"; btn.disabled = true; }
        return;
      }
    }

    chrome.tabs.sendMessage(
      p.activeTab.id,
      { type: "NV_TRANSFORM_PAGE_START", payload: {} },
      () => { void chrome.runtime.lastError; }
    );
    window.close();
  };
})();
