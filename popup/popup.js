/**
 * NeuroVision — Popup entry: load settings, metrics, and bind UI.
 */
(function () {
  "use strict";

  const p = window.NVPopup;

  async function init() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    p.activeTab = tabs[0];

    if (p.activeTab?.url) {
      const url = new URL(p.activeTab.url);
      p.$("domain-label").textContent = url.hostname;
    }

    const resp = await p.send(p.MSG.GET_SETTINGS);
    if (resp?.success) {
      p.settings = resp.data;
      p.renderSettings(p.settings);
    }

    p.loadPageMetrics();
    p.checkOllamaStatus();
    p.attachListeners();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
