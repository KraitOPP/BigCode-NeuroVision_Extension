/**
 * NeuroVision — Side panel entry: tabs, init, active-tab refresh.
 */
(function () {
  "use strict";

  const n = window.NVSP;

  function attachTabListeners() {
    document.querySelectorAll(".sp-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".sp-tab").forEach((t) => {
          t.classList.remove("active");
          t.setAttribute("aria-selected", "false");
        });
        document.querySelectorAll(".sp-panel").forEach((p) => {
          p.classList.remove("active");
          p.hidden = true;
        });
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");
        const panel = n.$(`panel-${tab.dataset.tab}`);
        if (panel) { panel.classList.add("active"); panel.hidden = false; }
      });
    });

    n.$("sp-ob-setup-btn")?.addEventListener("click", () => {
      document.querySelector('[data-tab="settings"]')?.click();
    });
  }

  async function init() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    n.activeTab = tabs[0];

    if (n.activeTab?.url) {
      try { n.$("sp-domain").textContent = new URL(n.activeTab.url).hostname; } catch {}
    }

    const resp = await n.send(n.MSG.GET_SETTINGS);
    if (resp?.success) n.settings = resp.data;

    const cfgResp = await n.send("NV_GET_CLOUD_CONFIG");
    if (cfgResp?.success) n.cloudConfig = cfgResp.data;

    await n.updateAiStatusDot();
    await n.loadPageData();

    attachTabListeners();
    n.attachActionListeners();
    n.attachSettingsListeners();
    n.populateSettingsPanel();
    n.checkOnboarding();
  }

  document.addEventListener("DOMContentLoaded", init);

  chrome.tabs.onActivated.addListener(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    n.activeTab   = tabs[0];
    n.pageText    = "";
    n.chatHistory = [];
    await n.loadPageData();
    await n.updateAiStatusDot();
    if (n.activeTab?.url) {
      try { n.$("sp-domain").textContent = new URL(n.activeTab.url).hostname; } catch {}
    }
  });
})();
