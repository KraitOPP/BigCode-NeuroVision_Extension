/**
 * NeuroVision — Page Analysis Cache
 *
 * Stores LLM analysis results per page URL + content fingerprint.
 * Uses chrome.storage.local (max 10MB).
 * TTL: 24 hours. Max entries: 60 (auto-evicts oldest).
 * Fixed seed + low temperature in prompts ensures same page → same output,
 * cache further guarantees consistency across revisits.
 */
(function () {
  "use strict";

  const NV = (window.NeuroVision = window.NeuroVision || {});

  const CACHE_KEY    = "nv_page_cache";
  const TTL_MS       = 24 * 60 * 60 * 1000; // 24 hours
  const MAX_ENTRIES  = 60;

  // ─── Simple djb2 hash ─────────────────────────────────────────────────────
  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) ^ str.charCodeAt(i);
      h = h >>> 0; // keep unsigned 32-bit
    }
    return h.toString(36);
  }

  // Content fingerprint: URL + first 600 chars of main text
  function fingerprint(url, contentSnippet) {
    const normalized = url.split("?")[0].split("#")[0]; // strip query + hash
    return hash(normalized + "|" + (contentSnippet || "").slice(0, 600));
  }

  // ─── Load / Save the full cache object ────────────────────────────────────
  function loadCache() {
    return new Promise((resolve) => {
      chrome.storage.local.get(CACHE_KEY, (data) => {
        resolve(data[CACHE_KEY] || {});
      });
    });
  }

  function saveCache(cacheObj) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [CACHE_KEY]: cacheObj }, resolve);
    });
  }

  // ─── Get cached analysis ──────────────────────────────────────────────────
  async function get(url, contentSnippet) {
    const fp   = fingerprint(url, contentSnippet);
    const all  = await loadCache();
    const entry = all[fp];
    if (!entry) return null;
    if (Date.now() - entry.ts > TTL_MS) {
      // Expired — remove and return null
      delete all[fp];
      await saveCache(all);
      return null;
    }
    return entry.data;
  }

  // ─── Store analysis ───────────────────────────────────────────────────────
  async function set(url, contentSnippet, data) {
    const fp  = fingerprint(url, contentSnippet);
    const all = await loadCache();

    all[fp] = { ts: Date.now(), url, data };

    // Evict oldest entries if over limit
    const keys = Object.keys(all);
    if (keys.length > MAX_ENTRIES) {
      const sorted = keys.sort((a, b) => all[a].ts - all[b].ts);
      sorted.slice(0, keys.length - MAX_ENTRIES).forEach((k) => delete all[k]);
    }

    await saveCache(all);
  }

  // ─── Clear all cached entries ─────────────────────────────────────────────
  async function clear() {
    await saveCache({});
  }

  // ─── Stats ────────────────────────────────────────────────────────────────
  async function stats() {
    const all   = await loadCache();
    const keys  = Object.keys(all);
    const now   = Date.now();
    const valid = keys.filter((k) => now - all[k].ts <= TTL_MS).length;
    return { total: keys.length, valid, expired: keys.length - valid };
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  NV.cache = { get, set, clear, stats, fingerprint };
})();
