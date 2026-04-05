/**
 * NeuroVision — Content Script Entry Point
 *
 * Loads after feature modules; boots orchestration and global shortcuts.
 */
(function () {
  "use strict";

  const NV = window.NeuroVision;

  document.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "r" || e.key === "R")) {
      e.preventDefault();
      if (NV.pageTransformer.isActive()) {
        NV.pageTransformer.exitReaderMode();
      } else {
        NV.contentTransform.runPageTransform();
      }
    }
  });

  if (NV.tts) {
    NV.tts.onStatusChange((text, isPlaying) => {
      const bar = document.getElementById("nv-rm-tts-bar");
      if (!bar) return;
      if (isPlaying) {
        bar.classList.add("active");
        const textEl = bar.querySelector(".nv-rm-tts-text");
        if (textEl) textEl.textContent = text || "Speaking…";
      } else {
        bar.classList.remove("active");
      }
      const ttsBtn = document.getElementById("nv-rm-btn-tts");
      if (ttsBtn) ttsBtn.classList.toggle("active", isPlaying);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => NV.contentOrchestrator.init());
  } else {
    setTimeout(() => NV.contentOrchestrator.init(), 300);
  }
})();
