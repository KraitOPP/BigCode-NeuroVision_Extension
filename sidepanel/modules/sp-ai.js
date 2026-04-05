/**
 * NeuroVision — Side panel: AI streaming, simplify/summary/concepts, chat.
 */
(function () {
  "use strict";

  const n = window.NVSP;

  n.attachActionListeners = function attachActionListeners() {
    n.$("target-grade")?.addEventListener("input", () => {
      n.$("grade-display").textContent = `Grade ${n.$("target-grade").value}`;
    });

    n.$("sp-btn-simplify-page")?.addEventListener("click", () => n.runSimplify("page"));
    n.$("sp-btn-simplify-selection")?.addEventListener("click", () => n.runSimplify("selection"));
    n.$("sp-btn-summarize")?.addEventListener("click", n.runSummarize);
    n.$("sp-btn-keywords")?.addEventListener("click", n.runKeywords);

    // ─── TTS panel ───────────────────────────────────────────────────────────
    n.$("sp-btn-speak-selection")?.addEventListener("click", n.runSpeakSelection);
    n.$("sp-btn-speak-page")?.addEventListener("click", n.runSpeakPage);
    n.$("sp-btn-tts-pause")?.addEventListener("click", n.toggleTtsPause);
    n.$("sp-btn-tts-stop")?.addEventListener("click", n.stopTts);

    n.$("sp-tts-rate")?.addEventListener("input", (e) => {
      const v = parseFloat(e.target.value).toFixed(1);
      n.$("sp-tts-rate-val").textContent = v + "×";
      n.sendToTab(n.activeTab?.id, "NV_TTS_SET_RATE", { value: parseFloat(v) }).catch(() => {});
    });
    n.$("sp-tts-pitch")?.addEventListener("input", (e) => {
      const v = parseFloat(e.target.value).toFixed(1);
      n.$("sp-tts-pitch-val").textContent = v;
      n.sendToTab(n.activeTab?.id, "NV_TTS_SET_PITCH", { value: parseFloat(v) }).catch(() => {});
    });
    n.$("sp-tts-voice")?.addEventListener("change", (e) => {
      n.sendToTab(n.activeTab?.id, "NV_TTS_SET_VOICE", { voice: e.target.value }).catch(() => {});
    });

    document.querySelector("[data-tab='tts']")?.addEventListener("click", () => {
      setTimeout(() => n.populateTtsVoices && n.populateTtsVoices(), 300);
    });

    const chatInput = n.$("chat-input");
    n.$("sp-chat-send")?.addEventListener("click", n.sendChatMessage);
    chatInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); n.sendChatMessage(); }
    });
  };

  /**
   * OpenAI-compatible SSE (Groq, etc.): parses `data: {...}` lines and delta content.
   */
  async function readOpenAiSseStream(response, onChunk) {
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`API HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t || t.startsWith(":")) continue;
        if (!t.startsWith("data:")) continue;
        const raw = t.replace(/^data:\s?/, "").trim();
        if (raw === "[DONE]") return full;
        try {
          const delta = JSON.parse(raw).choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            onChunk(delta, full);
          }
        } catch { /* partial line */ }
      }
    }
    return full;
  }

  /**
   * @param {string} prompt
   * @param {function(string, string)} onChunk — (delta, accumulated)
   * @param {object} [streamOpts]
   * @param {string} [streamOpts.systemPrompt]
   * @param {number} [streamOpts.maxCompletionTokens]
   * @param {number} [streamOpts.temperature]
   */
  n.aiStream = async function aiStream(prompt, onChunk, streamOpts = {}) {
    const cfg = n.cloudConfig;

    if (cfg?.provider !== "ollama" && cfg?.apiKey?.trim()) {
      const isGroq =
        cfg.provider === "groq" ||
        (cfg.baseUrl || "").includes("api.groq.com");

      const rawBase = isGroq
        ? (window.NVGroqUrl
          ? window.NVGroqUrl.normalizeGroqBaseUrl(cfg.baseUrl)
          : "https://api.groq.com/openai/v1")
        : (cfg.baseUrl || "").replace(/\/$/, "");
      const baseUrl = rawBase.replace(/\/$/, "");
      const model   = cfg.model;

      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.apiKey}`,
      };
      if (isGroq) {
        const messages = [];
        const sys = streamOpts.systemPrompt && String(streamOpts.systemPrompt).trim();
        if (sys) messages.push({ role: "system", content: sys });
        messages.push({ role: "user", content: prompt });

        const resp = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            messages,
            max_completion_tokens: streamOpts.maxCompletionTokens ?? 1000,
            temperature: streamOpts.temperature ?? 0.6,
            stream: true,
          }),
        });
        return readOpenAiSseStream(resp, onChunk);
      }

      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1000,
          temperature: 0.3,
          stream: false,
        }),
      });

      if (!resp.ok) throw new Error(`Cloud API HTTP ${resp.status}`);
      const data = await resp.json();
      const text = (data.choices?.[0]?.message?.content || "").trim();
      onChunk(text, text);
      return text;
    }

    const url   = cfg?.ollamaUrl || n.OLLAMA_BASE;
    const model = cfg?.ollamaModel || "qwen2.5:7b-instruct-q4_K_M";

    const resp = await fetch(`${url}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: true, options: { temperature: 0.3, num_predict: 800 } }),
    });

    if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}`);

    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let full = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value, { stream: true }).split("\n").filter(Boolean)) {
        try {
          const json = JSON.parse(line);
          if (json.response) { full += json.response; onChunk(json.response, full); }
        } catch {}
      }
    }
    return full;
  };

  n.getTabSelection = async function getTabSelection() {
    if (!n.activeTab?.id) return null;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: n.activeTab.id },
        func: () => window.getSelection()?.toString()?.trim() || "",
      });
      return results?.[0]?.result || null;
    } catch { return null; }
  };

  n.runSimplify = async function runSimplify(mode) {
    const grade = parseInt(n.$("target-grade").value) || 8;
    if (!n.activeTab?.id) { n.setStatus("simplify", "No active tab.", "error"); return; }

    if (mode === "selection") {
      const sel = await n.getTabSelection();
      if (!sel) { n.setStatus("simplify", "Select text on the page first.", "error"); return; }
      await n.sendToTab(n.activeTab.id, n.MSG.SIMPLIFY_PAGE_START, {
        mode: "selection",
        targetGrade: grade,
        text: sel,
      });
      n.setStatus("simplify", "Processing on page (parallel)…", "success");
      return;
    }

    if (!n.pageText) { n.setStatus("simplify", "No content found on this page.", "error"); return; }

    await n.sendToTab(n.activeTab.id, n.MSG.SIMPLIFY_PAGE_START, {
      mode: "page",
      targetGrade: grade,
    });
    n.setStatus("simplify", "Processing on page (parallel)…", "success");
  };

  n.runSummarize = async function runSummarize() {
    if (!n.activeTab?.id) { n.setStatus("summary", "No active tab.", "error"); return; }
    if (!n.pageText) { n.setStatus("summary", "No content found on this page.", "error"); return; }

    await n.sendToTab(n.activeTab.id, n.MSG.SUMMARIZE_PAGE_START, {});
    n.setStatus("summary", "Processing on page (parallel sections)…", "success");
  };

  n.runKeywords = async function runKeywords() {
    if (!n.pageText) { n.setStatus("concepts", "No content found on this page.", "error"); return; }
    n.setStatus("concepts", "Extracting concepts…", "working");

    try {
      const resp = await n.send(n.MSG.EXTRACT_KEYWORDS, { text: n.pageText.slice(0, 2000) });
      if (!resp?.success) throw new Error(resp?.error || "Extraction failed");
      await n.sendToTab(n.activeTab.id, "NV_APPLY_TO_PAGE", { action: "concepts", content: resp.data });
      n.setStatus("concepts", "Concepts highlighted on page ✓", "success");
    } catch (err) {
      n.setStatus("concepts", `Error: ${err.message.slice(0, 80)}`, "error");
    }
  };

  n.addChatBubble = function addChatBubble(role, text) {
    const messages = n.$("chat-messages");
    const bubble   = document.createElement("div");
    bubble.className = `sp-chat-msg ${role}`;
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  };

  n.sendChatMessage = async function sendChatMessage() {
    const input    = n.$("chat-input");
    const messages = n.$("chat-messages");
    const question = (input.value || "").trim();
    if (!question) return;

    input.value = "";
    n.addChatBubble("user", question);
    n.chatHistory.push({ role: "user", content: question });

    const thinkingEl = n.addChatBubble("thinking", "Thinking…");

    const context = n.pageText.slice(0, 2000);
    const history = n.chatHistory.slice(-4)
      .map((m) => `${m.role === "user" ? "Human" : "Assistant"}: ${m.content}`)
      .join("\n");

    const prompt = `You are a reading assistant helping someone understand a web page.
Page content: """${context}"""

${history}

Answer in simple, clear language:
${question}

Answer:`;

    try {
      let full = "";
      await n.aiStream(
        prompt,
        (_, accumulated) => {
          full = accumulated;
          thinkingEl.textContent = accumulated;
          thinkingEl.className = "sp-chat-msg assistant";
          messages.scrollTop = messages.scrollHeight;
        },
        {
          systemPrompt: "You are a reading assistant. Answer in simple, clear language.",
          maxCompletionTokens: 1000,
          temperature: 0.6,
        }
      );
      n.chatHistory.push({ role: "assistant", content: full });
    } catch (err) {
      thinkingEl.className = "sp-chat-msg assistant";
      thinkingEl.textContent = `Error: ${err.message}`;
    }

    messages.scrollTop = messages.scrollHeight;
  };

  // ─── TTS actions ─────────────────────────────────────────────────────────────

  n._ttsPlaying = false;
  n._ttsPaused = false;

  function setTtsPlayingUI(playing, text) {
    const bar = n.$("sp-tts-playing");
    if (!bar) return;
    bar.hidden = !playing;
    if (playing && text) {
      const el = n.$("sp-tts-current-text");
      if (el) el.textContent = text.slice(0, 80) + (text.length > 80 ? "…" : "");
    }
    n._ttsPlaying = playing;
    if (!playing) n._ttsPaused = false;
  }

  n.runSpeakSelection = async function runSpeakSelection() {
    if (!n.activeTab?.id) { n.setStatus("tts", "No active tab.", "error"); return; }
    // Get selection from the active tab
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: n.activeTab.id },
        func: () => window.getSelection()?.toString()?.trim() || "",
      });
      const text = results?.[0]?.result || "";
      if (!text) {
        n.setStatus("tts", "Select text on the page first, then click Speak.", "error");
        return;
      }
      await n.sendToTab(n.activeTab.id, "NV_SPEAK_SELECTION", { text });
      n.setStatus("tts", `Speaking: "${text.slice(0, 50)}${text.length > 50 ? "…" : ""}"`, "success");
      setTtsPlayingUI(true, text);
    } catch (err) {
      n.setStatus("tts", `Error: ${err.message.slice(0, 80)}`, "error");
    }
  };

  n.runSpeakPage = async function runSpeakPage() {
    if (!n.activeTab?.id) { n.setStatus("tts", "No active tab.", "error"); return; }
    if (!n.pageText) { n.setStatus("tts", "No content found on this page.", "error"); return; }
    try {
      await n.sendToTab(n.activeTab.id, "NV_SPEAK_SELECTION", { text: n.pageText.slice(0, 8000) });
      n.setStatus("tts", "Speaking page content…", "success");
      setTtsPlayingUI(true, "Full page");
    } catch (err) {
      n.setStatus("tts", `Error: ${err.message.slice(0, 80)}`, "error");
    }
  };

  n.toggleTtsPause = async function toggleTtsPause() {
    if (!n.activeTab?.id) return;
    const btn = n.$("sp-btn-tts-pause");
    if (n._ttsPaused) {
      await n.sendToTab(n.activeTab.id, "NV_TTS_RESUME", {});
      if (btn) btn.textContent = "⏸ Pause";
      n._ttsPaused = false;
    } else {
      await n.sendToTab(n.activeTab.id, "NV_TTS_PAUSE", {});
      if (btn) btn.textContent = "▶ Resume";
      n._ttsPaused = true;
    }
  };

  n.stopTts = async function stopTts() {
    if (!n.activeTab?.id) return;
    await n.sendToTab(n.activeTab.id, "NV_STOP_TTS", {}).catch(() => {});
    setTtsPlayingUI(false);
    n.setStatus("tts", "Stopped.", "");
  };

  n.populateTtsVoices = async function populateTtsVoices() {
    if (!n.activeTab?.id) return;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: n.activeTab.id },
        func: () => {
          const voices = window.speechSynthesis?.getVoices() || [];
          return voices.map(v => ({ name: v.name, lang: v.lang }));
        },
      });
      const voices = results?.[0]?.result || [];
      const sel = n.$("sp-tts-voice");
      if (!sel || !voices.length) return;
      sel.innerHTML = "<option value=''>Default</option>";
      voices.forEach(({ name, lang }) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = `${name} (${lang})`;
        sel.appendChild(opt);
      });
    } catch (err) { /* scripting not available */ }
  };

})();
