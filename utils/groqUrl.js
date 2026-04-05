/**
 * Groq OpenAI-compatible base URL must include /openai/v1 (not just /v1).
 * Wrong: https://api.groq.com/v1  → 404 on /chat/completions
 * Right: https://api.groq.com/openai/v1
 */
(function (root) {
  "use strict";

  var DEFAULT = "https://api.groq.com/openai/v1";

  function normalizeGroqBaseUrl(url) {
    var u = (url || "").trim().replace(/\/+$/, "");
    if (!u || !/api\.groq\.com/i.test(u)) return DEFAULT;
    if (/openai\/v1/i.test(u)) return u;
    return DEFAULT;
  }

  root.NVGroqUrl = { normalizeGroqBaseUrl: normalizeGroqBaseUrl, DEFAULT: DEFAULT };
})(typeof self !== "undefined" ? self : window);
