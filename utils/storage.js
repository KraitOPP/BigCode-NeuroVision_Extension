/**
 * NeuroVision — Storage Utilities
 * Wraps chrome.storage with promise-based API.
 * Supports per-domain overrides and global defaults.
 */
(function () {
  "use strict";

  const NV = (window.NeuroVision = window.NeuroVision || {});

  // ─── Default Settings ──────────────────────────────────────────────────────
  const DEFAULT_SETTINGS = {
    enabled: false,
    // Active condition profiles (can enable multiple)
    profiles: {
      adhd: false,
      autism: false,
      dyslexia: false,
    },
    // ADHD settings
    adhd: {
      focusMode: true,          // Dim content outside reading area
      readingRuler: true,       // Horizontal guide line
      removeAds: true,          // Remove ad elements
      removeAnimations: true,   // Stop CSS animations
      contentChunking: true,    // Visual breaks between sections
      highlightKeywords: false, // LLM-extracted keyword highlighting
      showReadingTime: true,    // Estimated reading time badge
      focusTunnel: false,       // Vignette effect around cursor
      chunkSize: 80,            // Words per chunk
    },
    // Autism settings
    autism: {
      reduceSaturation: true,   // Mute colors
      saturationLevel: 40,      // 0-100% (lower = more muted)
      removeAnimations: true,   // Stop all motion
      removeFlashing: true,     // Block flashing elements
      consistentSpacing: true,  // Normalize margins/padding
      hideDecorativeImages: false, // Hide non-content images
      softContrast: false,      // Reduce contrast (for photosensitive)
      sensorDial: 50,           // 0-100 overall sensory dial
    },
    // Dyslexia settings
    dyslexia: {
      customFont: true,         // Apply accessibility font
      fontChoice: "lexend",     // "lexend" | "opendyslexic" | "atkinson"
      letterSpacing: 0.12,      // em units — BDA recommendation
      wordSpacing: 0.16,        // em units — BDA recommendation
      lineHeight: 1.8,          // unitless — BDA recommends ≥1.5
      fontSize: 18,             // px — min 16px enforced in module
      colorOverlay: false,      // Reading tint
      overlayColor: "#FFFDE7",  // Pale yellow default
      overlayOpacity: 0.3,      // 0-1
      readingRuler: true,       // Line highlight
      syllableHighlight: false, // Color alternating syllables
      beelineColors: false,     // Per-line color gradient (Beeline-style)
      lineWidth: 70,            // Max chars per line
    },
    // LLM settings
    llm: {
      enabled: true,
      ollamaUrl: "http://localhost:11434",
      model: "qwen2.5:7b-instruct-q4_K_M",
      autoSimplify: false,      // Auto-simplify on page load
      targetGrade: 8,           // Target FK grade level
      showScore: true,          // Show cognitive load score badge
    },
    // Per-domain overrides: { "example.com": { ...partialSettings } }
    domainOverrides: {},
  };

  // ─── Storage API ──────────────────────────────────────────────────────────

  function getAll() {
    return new Promise((resolve) => {
      chrome.storage.local.get("neurovision_settings", (data) => {
        if (chrome.runtime.lastError) {
          console.warn("[NV Storage] getAll error:", chrome.runtime.lastError);
          resolve(structuredClone(DEFAULT_SETTINGS));
          return;
        }
        const stored = data.neurovision_settings;
        if (!stored) {
          resolve(structuredClone(DEFAULT_SETTINGS));
          return;
        }
        // Deep merge with defaults to handle new keys
        resolve(deepMerge(structuredClone(DEFAULT_SETTINGS), stored));
      });
    });
  }

  function setAll(settings) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ neurovision_settings: settings }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  async function get(key) {
    const settings = await getAll();
    return key.split(".").reduce((obj, k) => obj?.[k], settings);
  }

  async function set(key, value) {
    const settings = await getAll();
    const keys = key.split(".");
    let obj = settings;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    await setAll(settings);
    return settings;
  }

  // Get settings merged with domain-specific overrides
  async function getForDomain(domain) {
    const settings = await getAll();
    const domainKey = normalizeDomain(domain);
    const override = settings.domainOverrides?.[domainKey] || {};
    return deepMerge(settings, override);
  }

  async function setDomainOverride(domain, partialSettings) {
    const settings = await getAll();
    const domainKey = normalizeDomain(domain);
    if (!settings.domainOverrides) settings.domainOverrides = {};
    settings.domainOverrides[domainKey] = deepMerge(
      settings.domainOverrides[domainKey] || {},
      partialSettings
    );
    await setAll(settings);
  }

  async function clearDomainOverride(domain) {
    const settings = await getAll();
    const domainKey = normalizeDomain(domain);
    if (settings.domainOverrides?.[domainKey]) {
      delete settings.domainOverrides[domainKey];
      await setAll(settings);
    }
  }

  async function reset() {
    await setAll(structuredClone(DEFAULT_SETTINGS));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function normalizeDomain(domain) {
    try {
      return new URL(domain.startsWith("http") ? domain : `https://${domain}`)
        .hostname;
    } catch {
      return domain;
    }
  }

  function deepMerge(target, source) {
    if (!source || typeof source !== "object") return target;
    const output = Object.assign({}, target);
    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key])
      ) {
        output[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        output[key] = source[key];
      }
    }
    return output;
  }

  // ─── Change Listener ──────────────────────────────────────────────────────
  function onChange(callback) {
    chrome.storage.local.onChanged.addListener((changes) => {
      if (changes.neurovision_settings) {
        callback(
          changes.neurovision_settings.newValue,
          changes.neurovision_settings.oldValue
        );
      }
    });
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  NV.storage = {
    getAll,
    setAll,
    get,
    set,
    getForDomain,
    setDomainOverride,
    clearDomainOverride,
    reset,
    onChange,
    DEFAULT_SETTINGS,
    deepMerge,
  };
})();
