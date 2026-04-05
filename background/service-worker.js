/**
 * NeuroVision — Background Service Worker (Manifest V3)
 *
 * Loads modular handlers. All listeners registered at top level.
 */
importScripts(
  "../utils/groqUrl.js",
  "constants.js",
  "storage.js",
  "ai.js",
  "health.js",
  "messages.js"
);

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await NVBG.saveSettings(structuredClone(NVBG.DEFAULT_SETTINGS));
    console.log("[NeuroVision] Installed. Open the popup to configure.");
    chrome.tabs.create({ url: chrome.runtime.getURL("popup/popup.html") });
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url?.startsWith("http")) return;
  const settings = await NVBG.getSettings();
  if (!settings.enabled) return;
  chrome.tabs.sendMessage(tabId, { type: "NV_PING" }).catch(() => {});
});
