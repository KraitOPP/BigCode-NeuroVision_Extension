/**
 * NeuroVision — Popup: page readability metrics and Ollama status.
 */
(function () {
  "use strict";

  const p = window.NVPopup;

  p.loadPageMetrics = async function loadPageMetrics() {
    if (!p.activeTab?.id) return;

    const resp = await p.sendToTab(p.activeTab.id, "NV_GET_PAGE_METRICS");
    if (!resp?.success || !resp.data) return;

    p.metrics = resp.data;
    p.renderMetrics(p.metrics);
  };

  p.renderMetrics = function renderMetrics(metrics) {
    if (!metrics) return;

    const gradeEl = p.$("m-grade");
    const loadEl = p.$("m-load");
    const timeEl = p.$("m-time");
    const wordsEl = p.$("m-words");

    if (gradeEl) {
      gradeEl.textContent = metrics.readingGrade ?? "—";
      const grade = metrics.readingGrade ?? 0;
      gradeEl.style.color =
        grade <= 6 ? "#10B981" :
        grade <= 10 ? "#F59E0B" : "#EF4444";
    }

    if (loadEl) {
      loadEl.textContent = metrics.cognitiveLoad ?? "—";
      const load = metrics.cognitiveLoad ?? 0;
      loadEl.style.color =
        load <= 30 ? "#10B981" :
        load <= 60 ? "#F59E0B" : "#EF4444";
    }

    if (timeEl) timeEl.textContent = metrics.readingTime ?? "—";
    if (wordsEl) {
      const w = metrics.wordCount ?? 0;
      wordsEl.textContent = w > 999 ? `${(w / 1000).toFixed(1)}k` : String(w);
    }
  };

  p.checkOllamaStatus = async function checkOllamaStatus() {
    const statusEl = p.$("ollama-status");
    if (!statusEl) return;

    const resp      = await p.send(p.MSG.CHECK_OLLAMA);
    const available = resp?.success && resp.data?.available;
    const models    = resp?.data?.models || [];
    const hasGemma  = models.some((m) => m.includes("gemma3"));

    statusEl.classList.toggle("online",  available);
    statusEl.classList.toggle("offline", !available);
    statusEl.title = available
      ? `Ollama online • ${models.join(", ")}`
      : "Ollama offline — run start_ollama.ps1";

    const modelLabel = p.$("model-label");
    if (modelLabel) {
      modelLabel.textContent = hasGemma ? "gemma3:4b" : (models[0]?.split(":")[0] || "offline");
      modelLabel.style.color = hasGemma ? "#10B981" : (available ? "#F59E0B" : "#EF4444");
    }

    ["btn-simplify", "btn-summarize", "btn-keywords", "btn-transform"].forEach((id) => {
      const btn = p.$(id);
      if (btn) btn.disabled = !available;
    });
  };
})();
