/**
 * NeuroVision — Background: cloud + Ollama generation and transform.
 */
(function (g) {
  "use strict";

  const NVBG = g.NVBG;

  function isGroqCfg(cfg) {
    return cfg?.provider === "groq" || (cfg?.baseUrl || "").includes("api.groq.com");
  }

  function isGeminiCfg(cfg) {
    return cfg?.provider === "gemini";
  }

  async function geminiGenerate(prompt, cfg, maxTokens = 600, temperature = 0.3, systemInstruction = null) {
    const model  = cfg.model || "gemini-3.1-pro";
    const apiKey = cfg.apiKey.trim();
    const url    = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const body   = {
      contents: [{ parts: [{ text: prompt }], role: "user" }],
      generationConfig: { maxOutputTokens: maxTokens, temperature },
    };
    if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      throw new Error(`Gemini API HTTP ${resp.status}: ${errBody.slice(0, 200)}`);
    }
    const data = await resp.json();
    return (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  }

  function groqChatBase(cfg) {
    return self.NVGroqUrl.normalizeGroqBaseUrl(cfg.baseUrl);
  }

  async function cloudGenerate(prompt, cfg, maxTokens = 600, temperature = 0.3) {
    // Gemini has its own function — never let it reach this OpenAI-compatible path
    if (isGeminiCfg(cfg)) return geminiGenerate(prompt, cfg, maxTokens, temperature);
    const baseRoot = isGroqCfg(cfg) ? groqChatBase(cfg) : (cfg.baseUrl || "").replace(/\/$/, "");
    const url   = `${baseRoot}/chat/completions`;
    const model = cfg.model;

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cfg.apiKey}`,
    };



    const body = isGroqCfg(cfg)
      ? {
          model,
          messages: [{ role: "user", content: prompt }],
          max_completion_tokens: maxTokens,
          temperature,
          stream: false,
        }
      : {
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxTokens,
          temperature,
          stream: false,
        };

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      let hint = "";
      if (resp.status === 404 && isGroqCfg(cfg)) {
        hint = " Groq expects base URL https://api.groq.com/openai/v1 (path must include /openai/v1, not only /v1). Re-save Settings.";
      }
      throw new Error(`Cloud API HTTP ${resp.status}: ${errBody.slice(0, 200)}${hint}`);
    }

    const data = await resp.json();
    return (data.choices?.[0]?.message?.content || "").trim();
  }

  async function ollamaGenerate(prompt, model, maxTokens = 600, temperature = 0.3) {
    const resp = await fetch(`${NVBG.OLLAMA_BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || NVBG.DEFAULT_MODEL,
        prompt,
        stream: false,
        options: { temperature, num_predict: maxTokens, seed: 42 },
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}`);
    const data = await resp.json();
    return (data.response || "").trim();
  }

  async function ollamaTransform(prompt, model) {
    const resp = await fetch(`${NVBG.OLLAMA_BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || NVBG.DEFAULT_MODEL,
        prompt,
        stream: false,
        format: "json",
        options: { temperature: 0.1, num_predict: 4000, seed: 42 },
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}`);
    const data = await resp.json();
    return (data.response || "").trim();
  }

  async function cloudTransform(prompt, cfg) {
    // Gemini has its own function — never let it reach this OpenAI-compatible path
    if (isGeminiCfg(cfg)) {
      const sys = "You are a web accessibility expert. You MUST respond with valid JSON only. No markdown, no explanation, just the JSON object.";
      return geminiGenerate(prompt, cfg, 4000, 0.1, sys);
    }
    const baseRoot = isGroqCfg(cfg) ? groqChatBase(cfg) : (cfg.baseUrl || "").replace(/\/$/, "");
    const url   = `${baseRoot}/chat/completions`;
    const model = cfg.model;

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cfg.apiKey}`,
    };


    const messages = [
      {
        role: "system",
        content: "You are a web accessibility expert. You MUST respond with valid JSON only. No markdown, no explanation, just the JSON object.",
      },
      { role: "user", content: prompt },
    ];

    const body = isGroqCfg(cfg)
      ? {
          model,
          messages,
          max_completion_tokens: 4000,
          temperature: 0.1,
          stream: false,
        }
      : {
          model,
          messages,
          max_tokens: 4000,
          temperature: 0.1,
          stream: false,
        };

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      let hint = "";
      if (resp.status === 404 && isGroqCfg(cfg)) {
        hint = " Groq expects base URL https://api.groq.com/openai/v1 (path must include /openai/v1). Re-save Settings.";
      }
      throw new Error(`Cloud API HTTP ${resp.status}: ${errBody.slice(0, 200)}${hint}`);
    }

    const data = await resp.json();
    return (data.choices?.[0]?.message?.content || "").trim();
  }

  async function aiGenerate(prompt, maxTokens = 600, temperature = 0.3) {
    const cfg = await NVBG.getCloudConfig();

    if (cfg.provider !== "ollama" && cfg.apiKey?.trim()) {
      try {
        if (isGeminiCfg(cfg)) return await geminiGenerate(prompt, cfg, maxTokens, temperature);
        return await cloudGenerate(prompt, cfg, maxTokens, temperature);
      } catch (err) {
        console.warn("[NV] Cloud API failed, falling back to Ollama:", err.message);
      }
    }

    const ollamaModel = cfg.ollamaModel || NVBG.DEFAULT_MODEL;
    return ollamaGenerate(prompt, ollamaModel, maxTokens, temperature);
  }

  async function aiTransform(prompt) {
    const cfg = await NVBG.getCloudConfig();

    if (cfg.provider !== "ollama" && cfg.apiKey?.trim()) {
      try {
        if (isGeminiCfg(cfg)) {
          const sys = "You are a web accessibility expert. You MUST respond with valid JSON only. No markdown, no explanation, just the JSON object.";
          return await geminiGenerate(prompt, cfg, 4000, 0.1, sys);
        }
        return await cloudTransform(prompt, cfg);
      } catch (err) {
        console.warn("[NV] Cloud transform failed, falling back to Ollama:", err.message);
      }
    }

    const settings = await NVBG.getSettings();
    const model = settings?.llm?.model || NVBG.DEFAULT_MODEL;
    return ollamaTransform(prompt, model);
  }

  NVBG.cloudGenerate = cloudGenerate;
  NVBG.ollamaGenerate = ollamaGenerate;
  NVBG.aiGenerate = aiGenerate;
  NVBG.aiTransform = aiTransform;
})(self);
