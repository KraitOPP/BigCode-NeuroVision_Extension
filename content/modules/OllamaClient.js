/**
 * NeuroVision — Ollama Client (Content Script version)
 *
 * Content scripts cannot fetch localhost directly — Chrome's Private Network
 * Access policy blocks it with ERR_FAILED / CORS errors.
 *
 * This module proxies ALL Ollama calls through the background service worker
 * (which has extension origin and is allowed to access localhost via host_permissions).
 *
 * The API is identical to the direct client so the rest of the codebase is unchanged.
 */
(function () {
  "use strict";

  const NV = (window.NeuroVision = window.NeuroVision || {});

  let _available = null; // cached health state

  // ─── Background Message Bridge ────────────────────────────────────────────
  function msgBg(type, payload = {}) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, payload }, (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(resp || { success: false, error: "no response" });
        });
      } catch (err) {
        resolve({ success: false, error: err.message });
      }
    });
  }

  // ─── Health Check ─────────────────────────────────────────────────────────
  async function checkHealth() {
    const resp = await msgBg("NV_CHECK_OLLAMA");
    _available = resp?.data?.available ?? false;
    return resp?.data || { available: false, error: resp?.error };
  }

  // ─── Text Simplification ──────────────────────────────────────────────────
  async function simplifyText(text, targetGrade = 8) {
    if (!text || text.length < 20) return text;
    const resp = await msgBg("NV_SIMPLIFY_TEXT", {
      text: text.slice(0, 2000),
      targetGrade,
    });
    if (!resp?.success) throw new Error(resp?.error || "Simplification failed");
    return resp.data || text;
  }

  // ─── Summarize ────────────────────────────────────────────────────────────
  async function summarizeText(text) {
    if (!text || text.length < 50) return text;
    const resp = await msgBg("NV_SUMMARIZE_TEXT", { text: text.slice(0, 3000) });
    if (!resp?.success) throw new Error(resp?.error || "Summarization failed");
    return resp.data || "";
  }

  // ─── Keywords ─────────────────────────────────────────────────────────────
  async function extractKeywords(text) {
    if (!text || text.length < 30) return [];
    const resp = await msgBg("NV_EXTRACT_KEYWORDS", { text: text.slice(0, 2000) });
    if (!resp?.success) throw new Error(resp?.error || "Keyword extraction failed");
    const raw = resp.data || "";
    if (typeof raw === "string") {
      return raw.split(",").map((k) => k.trim()).filter((k) => k.length > 1 && k.length < 60);
    }
    return Array.isArray(raw) ? raw : [];
  }

  // ─── Word Explanation ─────────────────────────────────────────────────────
  async function explainWord(word, context = "") {
    const resp = await msgBg("NV_EXPLAIN_WORD", {
      word,
      context: context.slice(0, 200),
    });
    if (!resp?.success) throw new Error(resp?.error || "Explanation failed");
    return resp.data || "";
  }

  // ─── Autism Rephrase (routes through simplify) ────────────────────────────
  async function autismRephrase(text) {
    if (!text || text.length < 20) return text;
    const resp = await msgBg("NV_SIMPLIFY_TEXT", {
      text: text.slice(0, 2000),
      targetGrade: 8,
    });
    if (!resp?.success) throw new Error(resp?.error || "Rephrase failed");
    return resp.data || text;
  }

  // ─── No-ops (config handled by background) ───────────────────────────────
  function configure() { /* background handles config */ }
  function clearCache() { /* background handles cache */ }
  function isAvailable() { return _available; }

  // ─── Public API ──────────────────────────────────────────────────────────
  NV.ollama = {
    checkHealth,
    simplifyText,
    summarizeText,
    extractKeywords,
    explainWord,
    autismRephrase,
    configure,
    clearCache,
    isAvailable,
  };
})();
