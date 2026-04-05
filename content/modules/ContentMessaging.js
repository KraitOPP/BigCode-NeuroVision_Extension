/**
 * NeuroVision — Content script chrome.runtime.onMessage routing.
 */
(function () {
  "use strict";

  const NV = (window.NeuroVision = window.NeuroVision || {});
  const { MSG } = NV.messaging;

  function setup() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message?.type) return false;

      switch (message.type) {

        case MSG.SETTINGS_UPDATED:
          NV.contentOrchestrator.handleSettingsChange(message.payload.settings)
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
          return true;

        case MSG.GET_PAGE_METRICS: {
          const S = NV.contentState;
          if (!S.metrics) {
            try { S.metrics = NV.readabilityScorer.computeMetrics(); }
            catch (err) { sendResponse({ success: false, error: err.message }); return false; }
          }
          sendResponse({
            success: true,
            data: {
              readingGrade: S.metrics.readingGrade,
              readingEase: S.metrics.readingEase,
              wordCount: S.metrics.wordCount,
              sentenceCount: S.metrics.sentenceCount,
              cognitiveLoad: S.metrics.cognitiveLoad,
              readingTime: S.metrics.readingTime,
              readingTimeDyslexia: S.metrics.readingTimeDyslexia,
              mainText: (S.metrics.mainText || "").slice(0, 8000),
              url: window.location.href,
              domain: window.location.hostname,
            },
          });
          return false;
        }

        case MSG.SIMPLIFY_TEXT:
          NV.contentPageApply.handleAndApply("simplify", message.payload, sendResponse);
          return true;

        case MSG.SUMMARIZE_TEXT:
          NV.contentPageApply.handleAndApply("summarize", message.payload, sendResponse);
          return true;

        case MSG.EXTRACT_KEYWORDS:
          NV.contentPageApply.handleAndApply("keywords", message.payload, sendResponse);
          return true;

        case MSG.APPLY_TO_PAGE: {
          const { action, content } = message.payload;
          NV.contentPageApply.injectPageStyles();
          NV.contentPageApply.applyToPage(action, content);
          sendResponse({ success: true });
          return false;
        }

        case "NV_SPEAK_SELECTION": {
          const text = message.payload?.text || "";
          if (text && NV.tts) {
            NV.tts.stopSpeaking();
            NV.tts.speakText(text);
          } else if (NV.tts) {
            NV.tts.speakSelection();
          }
          sendResponse({ success: true });
          return false;
        }

        case "NV_STOP_TTS":
          if (NV.tts) NV.tts.stopSpeaking();
          sendResponse({ success: true });
          return false;

        case "NV_TTS_PAUSE":
          if (NV.tts) NV.tts.pauseSpeaking();
          sendResponse({ success: true });
          return false;

        case "NV_TTS_RESUME":
          if (NV.tts) NV.tts.resumeSpeaking();
          sendResponse({ success: true });
          return false;

        case "NV_TTS_SET_RATE":
          if (NV.tts) NV.tts.setRate(message.payload?.value ?? 1.0);
          sendResponse({ success: true });
          return false;

        case "NV_TTS_SET_PITCH":
          if (NV.tts) NV.tts.setPitch(message.payload?.value ?? 1.0);
          sendResponse({ success: true });
          return false;

        case "NV_TTS_SET_VOICE":
          if (NV.tts) NV.tts.setVoice(message.payload?.voice || "");
          sendResponse({ success: true });
          return false;

        case "NV_TTS_GET_VOICES":
          sendResponse({
            success: true,
            data: (NV.tts?.getVoices() || []).map(v => ({ name: v.name, lang: v.lang }))
          });
          return false;

        case MSG.OLLAMA_STATUS:
          NV.ollama.checkHealth()
            .then((health) => sendResponse({ success: true, data: health }));
          return true;

        case MSG.SIMPLIFY_PAGE_START:
          NV.contentAsyncApply.startSimplify(message.payload || {});
          sendResponse({ success: true });
          return false;

        case MSG.SUMMARIZE_PAGE_START:
          NV.contentAsyncApply.startSummarize(message.payload || {});
          sendResponse({ success: true });
          return false;

        case "NV_TRANSFORM_PAGE_START":
          NV.contentTransform.runPageTransform();
          sendResponse({ success: true });
          return false;

        case "NV_EXIT_READER":
          NV.pageTransformer.exitReaderMode();
          sendResponse({ success: true });
          return false;

        case "NV_CLEAR_CACHE":
          NV.cache.clear()
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
          return true;

        default:
          return false;
      }
    });
  }

  NV.contentMessaging = { setup };
})();
