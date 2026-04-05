/**
 * NeuroVision — Background: shared constants and default settings.
 */
(function (g) {
  "use strict";

  const NVBG = (g.NVBG = g.NVBG || {});

  NVBG.OLLAMA_BASE   = "http://localhost:11434";
  NVBG.DEFAULT_MODEL = "qwen2.5:7b-instruct-q4_K_M";
  NVBG.CLOUD_CFG_KEY = "nv_cloud_config";

  NVBG.MSG = {
    GET_SETTINGS:     "NV_GET_SETTINGS",
    PAGE_ANALYZED:    "NV_PAGE_ANALYZED",
    SIMPLIFY_TEXT:    "NV_SIMPLIFY_TEXT",
    SUMMARIZE_TEXT:   "NV_SUMMARIZE_TEXT",
    EXTRACT_KEYWORDS: "NV_EXTRACT_KEYWORDS",
    EXPLAIN_WORD:     "NV_EXPLAIN_WORD",
    OLLAMA_STATUS:    "NV_OLLAMA_STATUS",
    SETTINGS_UPDATED: "NV_SETTINGS_UPDATED",
    APPLY_PROFILE:    "NV_APPLY_PROFILE",
    TOGGLE_EXTENSION: "NV_TOGGLE_EXTENSION",
    UPDATE_SETTING:   "NV_UPDATE_SETTING",
    GET_PAGE_METRICS: "NV_GET_PAGE_METRICS",
    CHECK_OLLAMA:     "NV_CHECK_OLLAMA",
    PAGE_METRICS:     "NV_PAGE_METRICS",
    OLLAMA_HEALTH:    "NV_OLLAMA_HEALTH",
    DETECT_IDIOMS:    "NV_DETECT_IDIOMS",
    DETECT_TONE:      "NV_DETECT_TONE",
  };

  NVBG.DEFAULT_SETTINGS = {
    enabled: false,
    profiles: { adhd: false, autism: false, dyslexia: false },
    adhd: {
      focusMode: true, readingRuler: true, removeAds: true,
      removeAnimations: true, contentChunking: true, highlightKeywords: false,
      showReadingTime: true, focusTunnel: false, chunkSize: 80,
    },
    autism: {
      reduceSaturation: true, saturationLevel: 40, removeAnimations: true,
      consistentSpacing: true, hideDecorativeImages: false,
      softContrast: false, sensorDial: 50,
      idiomDecoder: true, toneIndicators: false,
    },
    dyslexia: {
      customFont: true, fontChoice: "lexend", letterSpacing: 0.15,
      wordSpacing: 0.3, lineHeight: 1.8, fontSize: 18, colorOverlay: false,
      overlayColor: "#FFFDE7", overlayOpacity: 0.3, readingRuler: true,
      syllableHighlight: false, beelineColors: false, lineWidth: 70,
    },
    llm: {
      enabled: true, ollamaUrl: NVBG.OLLAMA_BASE, model: NVBG.DEFAULT_MODEL,
      autoSimplify: false, targetGrade: 8, showScore: true,
    },
    domainOverrides: {},
  };
})(self);