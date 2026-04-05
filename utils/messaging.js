/**
 * NeuroVision — Messaging Utilities
 * Typed message passing between content scripts, popup, and service worker.
 */
(function () {
  "use strict";

  const NV = (window.NeuroVision = window.NeuroVision || {});

  // ─── Message Types ────────────────────────────────────────────────────────
  const MSG = {
    // Content → Background
    GET_SETTINGS: "NV_GET_SETTINGS",
    PAGE_ANALYZED: "NV_PAGE_ANALYZED",
    SIMPLIFY_TEXT: "NV_SIMPLIFY_TEXT",
    SUMMARIZE_TEXT: "NV_SUMMARIZE_TEXT",
    EXTRACT_KEYWORDS: "NV_EXTRACT_KEYWORDS",
    EXPLAIN_WORD: "NV_EXPLAIN_WORD",
    OLLAMA_STATUS: "NV_OLLAMA_STATUS",

    // Side panel → Content (apply AI results to page DOM)
    APPLY_TO_PAGE: "NV_APPLY_TO_PAGE",

    // Fire-and-forget page jobs (progress on page, like transform)
    SIMPLIFY_PAGE_START: "NV_SIMPLIFY_PAGE_START",
    SUMMARIZE_PAGE_START: "NV_SUMMARIZE_PAGE_START",

    // Background → Content
    SETTINGS_UPDATED: "NV_SETTINGS_UPDATED",
    SIMPLIFICATION_RESULT: "NV_SIMPLIFICATION_RESULT",
    SUMMARY_RESULT: "NV_SUMMARY_RESULT",
    KEYWORDS_RESULT: "NV_KEYWORDS_RESULT",
    WORD_EXPLANATION: "NV_WORD_EXPLANATION",

    // Popup → Background
    APPLY_PROFILE: "NV_APPLY_PROFILE",
    TOGGLE_EXTENSION: "NV_TOGGLE_EXTENSION",
    UPDATE_SETTING: "NV_UPDATE_SETTING",
    GET_PAGE_METRICS: "NV_GET_PAGE_METRICS",
    CHECK_OLLAMA: "NV_CHECK_OLLAMA",

    // Background → Popup
    PAGE_METRICS: "NV_PAGE_METRICS",
    OLLAMA_HEALTH: "NV_OLLAMA_HEALTH",
  };

  // ─── Send to Background (from content or popup) ───────────────────────────
  function send(type, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          // Extension may not be listening yet — not always an error
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(response);
      });
    });
  }

  // ─── Send to specific Tab (from background or popup) ─────────────────────
  function sendToTab(tabId, type, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(response);
      });
    });
  }

  // ─── Listen (registers a handler for a message type) ──────────────────────
  // Returns a cleanup function to remove the listener
  function listen(type, handler) {
    const listener = (message, sender, sendResponse) => {
      if (message.type === type) {
        const result = handler(message.payload, sender);
        if (result instanceof Promise) {
          result
            .then((value) => sendResponse({ success: true, data: value }))
            .catch((err) =>
              sendResponse({ success: false, error: err.message })
            );
          return true; // Keep channel open for async response
        } else if (result !== undefined) {
          sendResponse({ success: true, data: result });
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  NV.messaging = { send, sendToTab, listen, MSG };
})();
