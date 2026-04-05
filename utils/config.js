/**
 * NeuroVision — Cloud API Configuration
 *
 * Supports two providers (all OpenAI-compatible):
 *   1. Groq       — https://api.groq.com/openai/v1 — model: moonshotai/kimi-k2-instruct-0905
 *   2. Ollama     — http://localhost:11434 — local fallback, no key needed
 *
 * API keys are stored in chrome.storage.local (never hardcoded).
 * Users enter keys via the AI Panel → Settings tab.
 */
(function () {
  "use strict";

  // ─── Provider presets ──────────────────────────────────────────────────────
  const PROVIDERS = {
    groq: {
      name: "Groq (Kimi K2)",
      baseUrl: "https://api.groq.com/openai/v1",
      defaultModel: "moonshotai/kimi-k2-instruct-0905",
      models: ["moonshotai/kimi-k2-instruct-0905"],
    },
    ollama: {
      name: "Ollama (local)",
      baseUrl: "http://localhost:11434",
      defaultModel: "qwen2.5:7b-instruct-q4_K_M",
      models: [],
    },
  };

  const STORAGE_KEY = "nv_cloud_config";

  // ─── Default cloud config ─────────────────────────────────────────────────
  const DEFAULT_CONFIG = {
    provider: "groq",
    apiKey: "",
    baseUrl: PROVIDERS.groq.baseUrl,
    model: PROVIDERS.groq.defaultModel,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "qwen2.5:7b-instruct-q4_K_M",
  };

  // ─── Storage helpers ───────────────────────────────────────────────────────
  async function getCloudConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (data) => {
        const stored = data[STORAGE_KEY] || {};
        resolve({ ...DEFAULT_CONFIG, ...stored });
      });
    });
  }

  async function saveCloudConfig(partial) {
    const current = await getCloudConfig();
    const updated = { ...current, ...partial };
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: updated }, resolve);
    });
  }

  // ─── Convenience: set provider (updates baseUrl + model to presets) ───────
  async function setProvider(providerKey) {
    const preset = PROVIDERS[providerKey];
    if (!preset) return;
    await saveCloudConfig({
      provider: providerKey,
      baseUrl: preset.baseUrl,
      model: preset.defaultModel,
    });
  }

  // ─── Check if cloud API is configured ────────────────────────────────────
  async function isCloudEnabled() {
    const cfg = await getCloudConfig();
    return cfg.provider !== "ollama" && cfg.apiKey.trim().length > 0;
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  const NV = (window.NeuroVision = window.NeuroVision || {});
  NV.cloudConfig = {
    PROVIDERS,
    DEFAULT_CONFIG,
    getCloudConfig,
    saveCloudConfig,
    setProvider,
    isCloudEnabled,
  };
})();
