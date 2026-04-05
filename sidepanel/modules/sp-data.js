/**
 * NeuroVision — Side panel: page text, footer metrics, AI status, onboarding.
 */
(function () {
  "use strict";

  const n = window.NVSP;

  n.loadPageData = async function loadPageData() {
    if (!n.activeTab?.id) return;
    const resp = await n.sendToTab(n.activeTab.id, "NV_GET_PAGE_METRICS");
    if (resp?.success && resp.data) {
      n.pageText = resp.data.mainText || "";
      n.renderFooterMetrics(resp.data);
      return;
    }
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: n.activeTab.id },
        func: () => {
          for (const sel of ["article", "main", '[role="main"]', ".post-content", "body"]) {
            const el = document.querySelector(sel);
            if (el) {
              const t = (el.innerText || "").trim();
              if (t.length > 200) return t.slice(0, 8000);
            }
          }
          return "";
        },
      });
      n.pageText = results?.[0]?.result || "";
    } catch { n.pageText = ""; }
  };

  n.renderFooterMetrics = function renderFooterMetrics(m) {
    if (!m) return;
    n.$("sp-m-grade").textContent  = m.readingGrade ?? "—";
    n.$("sp-m-load").textContent   = m.cognitiveLoad != null ? `${m.cognitiveLoad}/100` : "—";
    n.$("sp-m-time").textContent   = m.readingTime ?? "—";
    n.$("sp-m-dtime").textContent  = m.readingTimeDyslexia ?? "—";
  };

  n.updateAiStatusDot = async function updateAiStatusDot() {
    const dot   = n.$("sp-ai-dot");
    const label = n.$("sp-model-label");
    const cfg = n.cloudConfig;
    if (!cfg) return;

    if (cfg.provider !== "ollama" && cfg.apiKey?.trim()) {
      dot.className = "sp-ai-dot cloud";
      dot.title = `Cloud AI: ${n.PROVIDERS[cfg.provider]?.label || cfg.provider} — ${cfg.model}`;
      if (label) label.textContent = cfg.model?.split("/").pop()?.split(":")[0] || cfg.model || "cloud";
      return;
    }

    const resp = await n.send(n.MSG.CHECK_OLLAMA);
    const ok   = resp?.success && resp.data?.available;
    dot.className = `sp-ai-dot ${ok ? "online" : "offline"}`;
    dot.title = ok
      ? `Ollama online — ${(resp.data.models || []).slice(0, 2).join(", ")}`
      : "Ollama offline — configure cloud API or start Ollama";
    if (label) label.textContent = ok ? "ollama" : "no AI";
  };

  n.checkOnboarding = async function checkOnboarding() {
    const cfg = n.cloudConfig;
    const hasCloud = cfg?.provider !== "ollama" && cfg?.apiKey?.trim();
    if (hasCloud) { n.$("sp-onboarding").hidden = true; return; }

    const resp = await n.send(n.MSG.CHECK_OLLAMA);
    const ollamaOk = resp?.success && resp.data?.available;
    n.$("sp-onboarding").hidden = ollamaOk;
  };
})();
