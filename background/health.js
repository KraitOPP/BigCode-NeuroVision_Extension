/**
 * NeuroVision — Background: Ollama and cloud API health checks.
 */
(function (g) {
  "use strict";

  const NVBG = g.NVBG;

  async function checkOllamaHealth() {
    try {
      const resp = await fetch(`${NVBG.OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!resp.ok) return { available: false, error: `HTTP ${resp.status}` };
      const data = await resp.json();
      return { available: true, models: (data.models || []).map((m) => m.name) };
    } catch (err) {
      return { available: false, error: err.message };
    }
  }

  async function checkCloudHealth() {
    const cfg = await NVBG.getCloudConfig();
    if (!cfg.apiKey?.trim()) return { available: false, error: "No API key set" };

    try {
      await NVBG.cloudGenerate("Say 'ok'", cfg, 10, 0);
      return { available: true, provider: cfg.provider, model: cfg.model };
    } catch (err) {
      return { available: false, error: err.message };
    }
  }

  NVBG.checkOllamaHealth = checkOllamaHealth;
  NVBG.checkCloudHealth = checkCloudHealth;
})(self);
