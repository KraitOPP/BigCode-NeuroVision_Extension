/**
 * NeuroVision — Side panel: AI provider settings UI and connection tests.
 */
(function () {
  "use strict";

  const n = window.NVSP;

  n.attachSettingsListeners = function attachSettingsListeners() {
    const providerSelect = n.$("ai-provider");
    providerSelect?.addEventListener("change", () => {
      n.updateSettingsProviderUI(providerSelect.value);
    });

    n.$("btn-toggle-key")?.addEventListener("click", () => {
      const inp = n.$("ai-api-key");
      if (!inp) return;
      inp.type = inp.type === "password" ? "text" : "password";
    });

    n.$("btn-save-ai-config")?.addEventListener("click", n.saveAiConfig);

    n.$("btn-test-connection")?.addEventListener("click", async () => {
      n.setStatus("settings", "Testing connections…", "working");
      await Promise.all([n.testOllamaHealth(), n.testCloudHealth()]);
      n.setStatus("settings", "Done.", "success");
      setTimeout(() => n.setStatus("settings", ""), 2000);
    });
  };

  n.updateSettingsProviderUI = function updateSettingsProviderUI(provider) {
    const preset = n.PROVIDERS[provider] || n.PROVIDERS.groq;
    const rowKey    = n.$("row-api-key");
    const rowModel  = n.$("row-model");
    const rowOllama = n.$("row-ollama-url");
    const keyHint   = n.$("api-key-hint");
    const keyLink   = n.$("api-key-link");
    const modelInput = n.$("ai-model");
    const keyInput  = n.$("ai-api-key");

    const isOllama = provider === "ollama";
    if (rowKey)    rowKey.hidden    = isOllama;
    if (rowModel)  rowModel.hidden  = isOllama;
    if (rowOllama) rowOllama.hidden = !isOllama;

    if (keyLink && preset.keyLink)  keyLink.textContent = preset.keyLink;
    if (keyHint) keyHint.hidden = !preset.keyLink;
    if (keyInput && preset.placeholder) keyInput.placeholder = preset.placeholder;
    if (modelInput && !modelInput.value) modelInput.value = preset.defaultModel;
  };

  n.populateSettingsPanel = function populateSettingsPanel() {
    if (!n.cloudConfig) return;
    const cfg = n.cloudConfig;

    const provSel = n.$("ai-provider");
    if (provSel) provSel.value = cfg.provider || "groq";

    const keyInp = n.$("ai-api-key");
    if (keyInp) keyInp.value = cfg.apiKey || "";

    const modelInp = n.$("ai-model");
    if (modelInp) modelInp.value = cfg.model || "";

    const ollamaInp = n.$("ollama-url");
    if (ollamaInp) ollamaInp.value = cfg.ollamaUrl || n.OLLAMA_BASE;

    n.updateSettingsProviderUI(cfg.provider || "groq");
  };

  n.saveAiConfig = async function saveAiConfig() {
    const provider    = n.$("ai-provider")?.value || "groq";
    const apiKey      = (n.$("ai-api-key")?.value || "").trim();
    const model       = (n.$("ai-model")?.value || "").trim()
                        || n.PROVIDERS[provider]?.defaultModel || "";
    const ollamaUrl   = (n.$("ollama-url")?.value || "").trim() || n.OLLAMA_BASE;

    const config = {
      provider,
      apiKey,
      model,
      baseUrl: provider === "groq"
        ? "https://api.groq.com/openai/v1"
        : "",
      ollamaUrl,
      ollamaModel: provider === "ollama" ? model : "",
    };

    n.setStatus("settings", "Saving…", "working");
    const resp = await n.send("NV_SAVE_CLOUD_CONFIG", { config });

    if (resp?.success) {
      n.cloudConfig = config;
      n.setStatus("settings", "Saved ✓", "success");
      await n.updateAiStatusDot();
      n.checkOnboarding();
      setTimeout(() => n.setStatus("settings", ""), 2000);
    } else {
      n.setStatus("settings", "Save failed.", "error");
    }
  };

  n.testOllamaHealth = async function testOllamaHealth() {
    const dot    = n.$("ollama-health-dot");
    const detail = n.$("ollama-health-detail");
    try {
      const resp = await n.send(n.MSG.CHECK_OLLAMA);
      const ok   = resp?.success && resp.data?.available;
      if (dot) { dot.className = `sp-ai-dot ${ok ? "online" : "offline"}`; }
      if (detail) detail.textContent = ok
        ? `${(resp.data.models || []).length} model(s)`
        : resp.data?.error?.slice(0, 30) || "Offline";
    } catch {
      if (dot) dot.className = "sp-ai-dot offline";
      if (detail) detail.textContent = "Error";
    }
  };

  n.testCloudHealth = async function testCloudHealth() {
    const dot    = n.$("cloud-health-dot");
    const detail = n.$("cloud-health-detail");
    const cfg    = n.cloudConfig;

    if (!cfg?.apiKey?.trim() || cfg.provider === "ollama") {
      if (dot) dot.className = "sp-ai-dot";
      if (detail) detail.textContent = "No key set";
      return;
    }

    try {
      const resp = await n.send("NV_CHECK_CLOUD");
      const ok   = resp?.success && resp.data?.available;
      if (dot) dot.className = `sp-ai-dot ${ok ? "cloud" : "offline"}`;
      if (detail) detail.textContent = ok ? cfg.model?.split(":")[0] || "OK" : resp.data?.error?.slice(0, 30) || "Failed";
    } catch {
      if (dot) dot.className = "sp-ai-dot offline";
      if (detail) detail.textContent = "Error";
    }
  };
})();
