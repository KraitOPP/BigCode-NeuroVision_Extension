/**
 * NeuroVision — Popup: messaging helpers and shared state.
 */
(function () {
  "use strict";

  window.NVPopup = {
    MSG: {
      GET_SETTINGS:     "NV_GET_SETTINGS",
      TOGGLE_EXTENSION: "NV_TOGGLE_EXTENSION",
      APPLY_PROFILE:    "NV_APPLY_PROFILE",
      UPDATE_SETTING:   "NV_UPDATE_SETTING",
      SETTINGS_UPDATED: "NV_SETTINGS_UPDATED",
      GET_PAGE_METRICS: "NV_GET_PAGE_METRICS",
      CHECK_OLLAMA:     "NV_CHECK_OLLAMA",
      SIMPLIFY_TEXT:    "NV_SIMPLIFY_TEXT",
      SUMMARIZE_TEXT:   "NV_SUMMARIZE_TEXT",
      EXTRACT_KEYWORDS: "NV_EXTRACT_KEYWORDS",
      SIMPLIFY_PAGE_START: "NV_SIMPLIFY_PAGE_START",
      SUMMARIZE_PAGE_START: "NV_SUMMARIZE_PAGE_START",
    },

    settings: null,
    metrics: null,
    activeTab: null,

    send(type, payload = {}) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type, payload }, (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(resp || { success: false, error: "No response" });
        });
      });
    },

    sendToTab(tabId, type, payload = {}) {
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type, payload }, (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(resp || { success: false });
        });
      });
    },

    $(id) {
      return document.getElementById(id);
    },

    setNestedKey(obj, path, value) {
      const keys = path.split(".");
      let cur = obj;
      for (let i = 0; i < keys.length - 1; i++) {
        if (cur[keys[i]] == null || typeof cur[keys[i]] !== "object") cur[keys[i]] = {};
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = value;
      return obj;
    },
  };
})();
