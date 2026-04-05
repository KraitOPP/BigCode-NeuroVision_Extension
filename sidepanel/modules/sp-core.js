/**
 * NeuroVision — Side panel: shared runtime, messaging, DOM helpers.
 */
(function () {
  "use strict";

  window.NVSP = {
    MSG: {
      GET_SETTINGS:       "NV_GET_SETTINGS",
      CHECK_OLLAMA:       "NV_CHECK_OLLAMA",
      EXTRACT_KEYWORDS:   "NV_EXTRACT_KEYWORDS",
      GET_PAGE_METRICS:   "NV_GET_PAGE_METRICS",
      SIMPLIFY_PAGE_START:   "NV_SIMPLIFY_PAGE_START",
      SUMMARIZE_PAGE_START:  "NV_SUMMARIZE_PAGE_START"
    },

    PROVIDERS: {
      groq: {
        label: "Groq (Kimi K2)",
        keyLink: "console.groq.com/keys",
        defaultModel: "moonshotai/kimi-k2-instruct-0905",
        placeholder: "gsk_xxxxxxxxxxxxxxxx"
      },
      ollama: {
        label: "Ollama (local)",
        keyLink: null,
        defaultModel: "qwen2.5:7b-instruct-q4_K_M",
        placeholder: ""
      }
    },

    OLLAMA_BASE: "http://localhost:11434",
    activeTab: null,
    settings: null,
    cloudConfig: null,
    pageText: "",
    chatHistory: [],

    send(type, payload = {}) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type, payload }, (resp) => {
          if (chrome.runtime.lastError) { resolve({ success: false, error: chrome.runtime.lastError.message }); return; }
          resolve(resp || { success: false });
        });
      });
    },

    sendToTab(tabId, type, payload = {}) {
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type, payload }, (resp) => {
          if (chrome.runtime.lastError) { resolve({ success: false, error: chrome.runtime.lastError.message }); return; }
          resolve(resp || { success: false });
        });
      });
    },

    $(id) { return document.getElementById(id); },

    setStatus(panelId, text, state = "") {
      const el = this.$(`status-${panelId}`);
      if (!el) return;
      el.textContent = text;
      el.className = `sp-status${state ? " " + state : ""}`;
    }
  };
})();
