/**
 * NeuroVision — Background: settings / cloud config storage and broadcast.
 */
(function (g) {
  "use strict";

  const NVBG = g.NVBG;

  function deepMerge(target, source) {
    if (!source || typeof source !== "object") return target;
    const output = Object.assign({}, target);
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
        output[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        output[key] = source[key];
      }
    }
    return output;
  }

  async function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get("neurovision_settings", (data) => {
        const stored = data.neurovision_settings;
        if (!stored) { resolve(structuredClone(NVBG.DEFAULT_SETTINGS)); return; }
        resolve(deepMerge(structuredClone(NVBG.DEFAULT_SETTINGS), stored));
      });
    });
  }

  async function saveSettings(settings) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ neurovision_settings: settings }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  }

  async function getCloudConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get(NVBG.CLOUD_CFG_KEY, (data) => {
        resolve(data[NVBG.CLOUD_CFG_KEY] || {
          provider: "groq",
          apiKey: "",
          baseUrl: "https://api.groq.com/openai/v1",
          model: "moonshotai/kimi-k2-instruct-0905",
          ollamaUrl: NVBG.OLLAMA_BASE,
          ollamaModel: NVBG.DEFAULT_MODEL,
        });
      });
    });
  }

  async function broadcastSettingsUpdate(settings) {
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    const msg = { type: NVBG.MSG.SETTINGS_UPDATED, payload: { settings } };
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
    });
  }

  NVBG.deepMerge = deepMerge;
  NVBG.getSettings = getSettings;
  NVBG.saveSettings = saveSettings;
  NVBG.getCloudConfig = getCloudConfig;
  NVBG.broadcastSettingsUpdate = broadcastSettingsUpdate;
})(self);
