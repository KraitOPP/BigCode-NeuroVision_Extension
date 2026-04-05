/**
 * NeuroVision — Full-page reader transform with loading UI and error panel.
 */
(function () {
  "use strict";

  const NV = (window.NeuroVision = window.NeuroVision || {});

  async function runPageTransform() {
    const S = NV.contentState;

    if (!S.metrics) {
      try { S.metrics = NV.readabilityScorer.computeMetrics(); } catch { /* ok */ }
    }

    let settings = S.settings;
    if (!settings) {
      try { settings = await NV.storage.getAll(); } catch { settings = {}; }
    }

    const loadEl = NV.contentLoadingOverlay.create();
    document.body.appendChild(loadEl);
    await new Promise((r) => requestAnimationFrame(r));

    try {
      await NV.pageTransformer.transformPage(settings, (pct, _total, msg) => {
        NV.contentLoadingOverlay.update(loadEl, pct, 100, msg);
      });
    } catch (err) {
      NV.contentAiPanel.injectStyles();
      const hint = err.message.includes("No readable content")
        ? err.message
        : `${err.message}\n\nMake sure:\n• Ollama is running (start_ollama.ps1)\n• qwen2.5:7b-instruct-q4_K_M is installed`;
      NV.contentAiPanel.show("⚠️ Transform Failed", hint, false);
    } finally {
      loadEl.remove();
    }
  }

  NV.contentTransform = { runPageTransform };
})();
