/**
 * NeuroVision — Popup: DOM event wiring.
 */
(function () {
  "use strict";

  const p = window.NVPopup;

  p.attachListeners = function attachListeners() {
    p.$("main-toggle")?.addEventListener("change", async (e) => {
      const resp = await p.send(p.MSG.TOGGLE_EXTENSION, { enabled: e.target.checked });
      if (resp?.success) p.settings = resp.data;
    });

    document.querySelectorAll(".nv-profile-card").forEach((card) => {
      card.addEventListener("click", async () => {
        const profile = card.dataset.profile;
        const currentlyOn = card.getAttribute("aria-pressed") === "true";
        await p.applyProfileChange(profile, !currentlyOn);
      });
    });

    document.querySelectorAll(".nv-setting-toggle").forEach((toggle) => {
      toggle.addEventListener("change", (e) => {
        p.applySettingChange(e.target.dataset.path, e.target.checked);
      });
    });

    const sensoryDial = p.$("sensory-dial");
    if (sensoryDial) {
      sensoryDial.addEventListener("input", (e) => {
        p.$("sensory-dial-value").textContent = e.target.value;
      });
      sensoryDial.addEventListener("change", (e) => {
        p.applySettingChange("autism.sensorDial", parseInt(e.target.value));
      });
    }

    const fontSizeSlider = p.$("font-size-slider");
    if (fontSizeSlider) {
      fontSizeSlider.addEventListener("input", (e) => {
        p.$("font-size-value").textContent = e.target.value;
      });
      fontSizeSlider.addEventListener("change", (e) => {
        p.applySettingChange("dyslexia.fontSize", parseInt(e.target.value));
      });
    }

    const lineHeightSlider = p.$("line-height-slider");
    if (lineHeightSlider) {
      lineHeightSlider.addEventListener("input", (e) => {
        p.$("line-height-value").textContent = parseFloat(e.target.value).toFixed(1);
      });
      lineHeightSlider.addEventListener("change", (e) => {
        p.applySettingChange("dyslexia.lineHeight", parseFloat(e.target.value));
      });
    }

    const fontChoice = p.$("font-choice");
    if (fontChoice) {
      fontChoice.addEventListener("change", (e) => {
        p.applySettingChange("dyslexia.fontChoice", e.target.value);
      });
    }

    const overlayColor = p.$("overlay-color");
    if (overlayColor) {
      overlayColor.addEventListener("change", (e) => {
        p.applySettingChange("dyslexia.overlayColor", e.target.value);
      });
    }

    document.querySelectorAll(".nv-collapse-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const isExpanded = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!isExpanded));
      });
    });

    p.$("btn-transform")?.addEventListener("click", p.runTransform);
    p.$("btn-close-ai")?.addEventListener("click", () => {
      p.$("ai-output").hidden = true;
    });

    p.$("btn-clear-cache")?.addEventListener("click", async () => {
      await p.sendToTab(p.activeTab.id, "NV_CLEAR_CACHE");
      const btn = p.$("btn-clear-cache");
      if (btn) { btn.textContent = "Cleared ✓"; setTimeout(() => { btn.textContent = "Clear Cache"; }, 2000); }
    });

    p.$("btn-sidepanel")?.addEventListener("click", () => {
      chrome.sidePanel.open({ windowId: p.activeTab.windowId }).catch(() => {
        chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel/sidepanel.html") });
      });
      window.close();
    });
  };
})();
