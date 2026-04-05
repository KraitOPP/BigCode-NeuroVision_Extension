/**
 * NeuroVision — Background: runtime message handler switch.
 */
(function (g) {
  "use strict";

  const NVBG = g.NVBG;
  const MSG = NVBG.MSG;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message?.type) return;

    switch (message.type) {

      case MSG.GET_SETTINGS: {
        NVBG.getSettings().then((s) => sendResponse({ success: true, data: s }));
        return true;
      }

      case MSG.TOGGLE_EXTENSION: {
        NVBG.getSettings().then(async (s) => {
          s.enabled = message.payload.enabled ?? !s.enabled;
          await NVBG.saveSettings(s);
          await NVBG.broadcastSettingsUpdate(s);
          sendResponse({ success: true, data: s });
        });
        return true;
      }

      case MSG.APPLY_PROFILE: {
        NVBG.getSettings().then(async (s) => {
          const { profile, enabled } = message.payload;
          if (profile in s.profiles) {
            s.profiles[profile] = enabled;
            if (enabled) s.enabled = true;
          }
          await NVBG.saveSettings(s);
          await NVBG.broadcastSettingsUpdate(s);
          sendResponse({ success: true, data: s });
        });
        return true;
      }

      case MSG.UPDATE_SETTING: {
        NVBG.getSettings().then(async (s) => {
          const { path, value } = message.payload;
          const keys = path.split(".");
          let obj = s;
          for (let i = 0; i < keys.length - 1; i++) {
            if (!obj[keys[i]]) obj[keys[i]] = {};
            obj = obj[keys[i]];
          }
          obj[keys[keys.length - 1]] = value;
          await NVBG.saveSettings(s);
          await NVBG.broadcastSettingsUpdate(s);
          sendResponse({ success: true, data: s });
        });
        return true;
      }

      case MSG.GET_PAGE_METRICS: {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (!tabs[0]) { sendResponse({ success: false, error: "No active tab" }); return; }
          chrome.tabs.sendMessage(tabs[0].id, { type: MSG.GET_PAGE_METRICS }, (resp) => {
            if (chrome.runtime.lastError) {
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
              sendResponse(resp);
            }
          });
        });
        return true;
      }

      case MSG.CHECK_OLLAMA: {
        NVBG.checkOllamaHealth().then((health) => sendResponse({ success: true, data: health }));
        return true;
      }

      case "NV_CHECK_CLOUD": {
        NVBG.checkCloudHealth().then((health) => sendResponse({ success: true, data: health }));
        return true;
      }

      case "NV_GET_CLOUD_CONFIG": {
        NVBG.getCloudConfig().then((cfg) => sendResponse({ success: true, data: cfg }));
        return true;
      }

      case "NV_SAVE_CLOUD_CONFIG": {
        const { config } = message.payload;
        chrome.storage.local.set({ [NVBG.CLOUD_CFG_KEY]: config }, () => {
          sendResponse({ success: true });
        });
        return true;
      }

      case MSG.SIMPLIFY_TEXT: {
        const { text, targetGrade = 8 } = message.payload;
        const prompt = `Rewrite at grade ${targetGrade} reading level. Short sentences. Simple words. Keep meaning. Return ONLY rewritten text.\n\n${text.slice(0, 2000)}`;
        NVBG.aiGenerate(prompt, 600)
          .then((result) => sendResponse({ success: true, data: result }))
          .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
      }

      case MSG.SUMMARIZE_TEXT: {
        const { text } = message.payload;
        const prompt = `Summarize in 3-5 bullet points. Simple language. Return ONLY bullets starting with "•".\n\n${text.slice(0, 3000)}`;
        NVBG.aiGenerate(prompt, 400)
          .then((result) => sendResponse({ success: true, data: result }))
          .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
      }

      case MSG.EXTRACT_KEYWORDS: {
        const { text } = message.payload;
        const prompt = `List 5-7 key concepts from this text as a comma-separated list. Return ONLY the list.\n\n${text.slice(0, 2000)}`;
        NVBG.aiGenerate(prompt, 100)
          .then((result) => sendResponse({ success: true, data: result }))
          .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
      }

      case MSG.EXPLAIN_WORD: {
        const { word, context } = message.payload;
        const prompt = `Explain "${word}" simply in 1-2 sentences. Everyday language. Context: "${(context || "").slice(0, 200)}". Return ONLY the explanation.`;
        NVBG.aiGenerate(prompt, 150)
          .then((result) => sendResponse({ success: true, data: result }))
          .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
      }

      case "NV_TRANSFORM_PAGE": {
        const { prompt } = message.payload;
        NVBG.aiTransform(prompt)
          .then((result) => sendResponse({ success: true, data: result }))
          .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
      }

      default:
        break;
    }
  });
})(self);
