/**
 * NeuroVision — Text-to-Speech Module
 *
 * Uses the Web Speech API (built-in browser TTS) — no API key needed.
 *
 * Features:
 * - Speak any text or the full page content
 * - Sentence-by-sentence playback with DOM highlighting
 * - Rate / pitch / voice controls
 * - Keyboard shortcut: Alt+T to toggle
 * - Works in both regular pages and reader mode
 * - Respects prefers-reduced-motion (skips highlight animation)
 */
(function () {
  "use strict";

  const NV = (window.NeuroVision = window.NeuroVision || {});

  // ─── State ────────────────────────────────────────────────────────────────────
  const STATE = {
    active:       false,
    utterance:    null,
    sentences:    [],     // { text, el, start, end } — DOM sentence info
    currentIdx:   -1,
    rate:         1.0,
    pitch:        1.0,
    volume:       1.0,
    voice:        null,   // SpeechSynthesisVoice
    onStatusChange: null, // callback(text, isPlaying)
    _highlightedEl: null,
  };

  // ─── Sentence splitter ───────────────────────────────────────────────────────
  // Splits text into sentences, preserving structure.
  function splitSentences(text) {
    if (!text) return [];
    return text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3);
  }

  // ─── Collect readable text from the page ─────────────────────────────────────
  // Returns an array of { text, node } for sentence-level highlighting.
  function collectPageText() {
    // Prefer reader overlay if active
    const readerOverlay = document.getElementById("nv-rm-main");
    const root = readerOverlay || NV.readabilityScorer?.extractMainContent()?.element || document.body;

    const results = [];
    const paras = root.querySelectorAll("p, li, .nv-rm-para, .nv-rm-step-text");

    paras.forEach((el) => {
      const text = (el.innerText || "").trim();
      if (text.length < 10) return;
      const sentences = splitSentences(text);
      sentences.forEach((sentence) => {
        results.push({ text: sentence, el });
      });
    });

    return results;
  }

  // ─── Highlight a sentence element ────────────────────────────────────────────
  function highlightSentence(item) {
    clearHighlight();
    if (!item?.el) return;

    // Prefer not to mutate DOM — use outline on the paragraph element
    STATE._highlightedEl = item.el;
    item.el.classList.add("nv-tts-speaking");

    // Scroll into view gently
    const rect = item.el.getBoundingClientRect();
    const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (!inView) {
      item.el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function clearHighlight() {
    if (STATE._highlightedEl) {
      STATE._highlightedEl.classList.remove("nv-tts-speaking");
      STATE._highlightedEl = null;
    }
    // Also clear any stray highlights
    document.querySelectorAll(".nv-tts-speaking").forEach((el) =>
      el.classList.remove("nv-tts-speaking")
    );
  }

  // ─── Status callback helper ───────────────────────────────────────────────────
  function notifyStatus(text, isPlaying) {
    if (STATE.onStatusChange) STATE.onStatusChange(text, isPlaying);
    // Hide mini bar when speech ends
    if (!isPlaying && STATE._hideBar) STATE._hideBar();
  }

  // ─── Core: speak a list of sentence items ────────────────────────────────────
  function speakItems(items, startIdx = 0) {
    if (!("speechSynthesis" in window)) {
      notifyStatus("TTS not supported in this browser.", false);
      return;
    }

    STATE.active   = true;
    STATE.sentences = items;
    STATE.currentIdx = startIdx;

    speakNext();
  }

  function speakNext() {
    if (!STATE.active) return;
    if (STATE.currentIdx >= STATE.sentences.length) {
      // Finished all sentences
      finish();
      return;
    }

    const item = STATE.sentences[STATE.currentIdx];
    highlightSentence(item);
    notifyStatus(item.text.slice(0, 80) + (item.text.length > 80 ? "…" : ""), true);

    const utt = new SpeechSynthesisUtterance(item.text);
    utt.rate   = STATE.rate;
    utt.pitch  = STATE.pitch;
    utt.volume = STATE.volume;
    if (STATE.voice) utt.voice = STATE.voice;

    utt.onend = () => {
      if (!STATE.active) return;
      STATE.currentIdx++;
      speakNext();
    };

    utt.onerror = (e) => {
      // Cancelled errors are expected when user stops
      if (e.error === "canceled" || e.error === "interrupted") return;
      console.warn("[NV TTS] Error:", e.error);
      finish();
    };

    STATE.utterance = utt;
    window.speechSynthesis.speak(utt);
  }

  function finish() {
    STATE.active     = false;
    STATE.currentIdx = -1;
    clearHighlight();
    notifyStatus("", false);
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  // Speak text directly (no DOM sync)
  function speakText(text) {
    stopSpeaking();
    const sentences = splitSentences(text);
    if (!sentences.length) return;
    const items = sentences.map((s) => ({ text: s, el: null }));
    speakItems(items);
  }

  // Speak full page with DOM sentence highlighting
  function speakPage() {
    stopSpeaking();
    const items = collectPageText();
    if (!items.length) {
      notifyStatus("No readable content found.", false);
      return;
    }
    speakItems(items);
  }

  // Speak from a specific DOM element
  function speakElement(el) {
    stopSpeaking();
    const text = (el?.innerText || "").trim();
    if (!text) return;
    const items = splitSentences(text).map((s) => ({ text: s, el }));
    speakItems(items);
  }

  function stopSpeaking() {
    STATE.active = false;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    clearHighlight();
    notifyStatus("", false);
  }

  function pauseSpeaking() {
    if ("speechSynthesis" in window) window.speechSynthesis.pause();
  }

  function resumeSpeaking() {
    if ("speechSynthesis" in window) window.speechSynthesis.resume();
  }

  function toggleSpeaking() {
    if (STATE.active) {
      stopSpeaking();
    } else {
      speakPage();
    }
  }

  // Get available voices
  function getVoices() {
    return window.speechSynthesis?.getVoices() || [];
  }

  // Set voice by name
  function setVoice(nameOrLang) {
    const voices = getVoices();
    const match = voices.find(
      (v) => v.name === nameOrLang || v.lang.startsWith(nameOrLang)
    );
    if (match) STATE.voice = match;
  }

  function setRate(r)   { STATE.rate   = Math.max(0.5, Math.min(2.5, r)); }
  function setPitch(p)  { STATE.pitch  = Math.max(0.5, Math.min(2.0, p)); }
  function setVolume(v) { STATE.volume = Math.max(0.0, Math.min(1.0, v)); }

  function onStatusChange(fn) { STATE.onStatusChange = fn; }

  function isActive() { return STATE.active; }

  // ─── Speak selected text ──────────────────────────────────────────────────────
  function speakSelection() {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : "";
    if (!text) {
      notifyStatus("No text selected.", false);
      return false;
    }
    stopSpeaking();
    const sentences = splitSentences(text);
    if (!sentences.length) return false;
    const items = sentences.map((s) => ({ text: s, el: null }));
    speakItems(items);
    showMiniBar(text.slice(0, 60) + (text.length > 60 ? "…" : ""));
    return true;
  }

  // ─── Floating mini TTS control bar ───────────────────────────────────────────
  let _miniBar = null;

  function injectMiniBarStyles() {
    if (document.getElementById("nv-tts-minibar-styles")) return;
    const s = document.createElement("style");
    s.id = "nv-tts-minibar-styles";
    s.textContent = `
      #nv-tts-minibar {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483646;
        display: flex;
        align-items: center;
        gap: 8px;
        background: #1E293B;
        color: #E2E8F0;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 40px;
        padding: 8px 16px 8px 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
        animation: nv-minibar-in 0.2s cubic-bezier(0.34,1.56,0.64,1);
        white-space: nowrap;
        max-width: 420px;
      }
      @keyframes nv-minibar-in {
        from { opacity: 0; transform: translateX(-50%) translateY(12px) scale(0.9); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0)     scale(1);   }
      }
      #nv-tts-minibar .nv-mb-icon {
        font-size: 16px;
        animation: nv-mb-pulse 1.2s ease-in-out infinite;
      }
      @keyframes nv-mb-pulse {
        0%,100% { opacity:1; }
        50%      { opacity:0.5; }
      }
      #nv-tts-minibar .nv-mb-text {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        color: #94A3B8;
        font-size: 12px;
        max-width: 220px;
      }
      #nv-tts-minibar .nv-mb-btn {
        background: rgba(255,255,255,0.08);
        border: none;
        border-radius: 50%;
        color: #E2E8F0;
        cursor: pointer;
        font-size: 14px;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
        flex-shrink: 0;
      }
      #nv-tts-minibar .nv-mb-btn:hover { background: rgba(255,255,255,0.18); }
      #nv-tts-minibar .nv-mb-stop {
        background: rgba(239,68,68,0.18);
        color: #FCA5A5;
      }
      #nv-tts-minibar .nv-mb-stop:hover { background: rgba(239,68,68,0.35); }

      /* Floating selection tooltip */
      #nv-tts-sel-tooltip {
        position: fixed;
        z-index: 2147483645;
        background: #1E293B;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px;
        padding: 5px 10px;
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        color: #E2E8F0;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        animation: nv-tooltip-in 0.15s ease;
        user-select: none;
        white-space: nowrap;
      }
      @keyframes nv-tooltip-in {
        from { opacity:0; transform: translateY(4px) scale(0.95); }
        to   { opacity:1; transform: translateY(0)   scale(1);    }
      }
      #nv-tts-sel-tooltip:hover { background: #263548; }
      #nv-tts-sel-tooltip .nv-tt-icon { font-size: 14px; }
      #nv-tts-sel-tooltip .nv-tt-kbd {
        background: rgba(255,255,255,0.1);
        border-radius: 3px;
        padding: 1px 4px;
        font-size: 10px;
        color: #94A3B8;
      }

      /* tts-speaking style for regular pages (reader-mode.css covers reader overlay) */
      .nv-tts-speaking {
        background: rgba(96, 165, 250, 0.22) !important;
        border-radius: 3px !important;
        transition: background 0.2s !important;
      }
    `;
    document.head.appendChild(s);
  }

  function showMiniBar(previewText) {
    injectMiniBarStyles();
    if (_miniBar) _miniBar.remove();

    const bar = document.createElement("div");
    bar.id = "nv-tts-minibar";
    bar.innerHTML = `
      <span class="nv-mb-icon">🔊</span>
      <span class="nv-mb-text">${previewText}</span>
      <button class="nv-mb-btn" id="nv-mb-pause" title="Pause / Resume">⏸</button>
      <button class="nv-mb-btn nv-mb-stop" id="nv-mb-stop" title="Stop speaking">■</button>
    `;
    document.body.appendChild(bar);
    _miniBar = bar;

    let paused = false;
    bar.querySelector("#nv-mb-pause").addEventListener("click", () => {
      if (paused) {
        resumeSpeaking();
        bar.querySelector("#nv-mb-pause").textContent = "⏸";
        paused = false;
      } else {
        pauseSpeaking();
        bar.querySelector("#nv-mb-pause").textContent = "▶";
        paused = true;
      }
    });
    bar.querySelector("#nv-mb-stop").addEventListener("click", () => {
      stopSpeaking();
    });
  }

  function hideMiniBar() {
    if (_miniBar) { _miniBar.remove(); _miniBar = null; }
  }

  // ─── Wrap finish/stop to also hide mini bar ───────────────────────────────────
  const _origFinish = finish;
  function finishWithBar() {
    _origFinish();
    hideMiniBar();
  }

  // Monkey-patch finish to also hide bar
  // (redefine internal reference via STATE helper)
  STATE._hideBar = hideMiniBar;

  // ─── Selection tooltip ────────────────────────────────────────────────────────
  let _tooltip = null;
  let _tooltipTimer = null;

  function removeTooltip() {
    if (_tooltip) { _tooltip.remove(); _tooltip = null; }
    clearTimeout(_tooltipTimer);
  }

  function showSelectionTooltip(x, y, text) {
    injectMiniBarStyles();
    removeTooltip();

    const tip = document.createElement("div");
    tip.id = "nv-tts-sel-tooltip";
    tip.innerHTML = `<span class="nv-tt-icon">🔊</span> Speak selection <span class="nv-tt-kbd">Alt+S</span>`;
    tip.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
    tip.style.top  = `${y - 44}px`;
    document.body.appendChild(tip);
    _tooltip = tip;

    tip.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeTooltip();
      speakSelection();
    });

    // Auto-hide after 4 seconds
    _tooltipTimer = setTimeout(removeTooltip, 4000);
  }

  document.addEventListener("mouseup", (e) => {
    // Small delay so selection is finalized
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : "";
      if (text.length > 2) {
        const range = sel.getRangeAt(0);
        const rect  = range.getBoundingClientRect();
        showSelectionTooltip(
          rect.left + window.scrollX + rect.width / 2 - 80,
          rect.top  + window.scrollY
        );
      } else {
        removeTooltip();
      }
    }, 50);
  });

  document.addEventListener("mousedown", (e) => {
    if (_tooltip && !_tooltip.contains(e.target)) removeTooltip();
  });

  document.addEventListener("selectionchange", () => {
    const sel = window.getSelection();
    if (!sel || sel.toString().trim().length < 3) removeTooltip();
  });

  // ─── Keyboard shortcut (Alt+S) for speak selection ───────────────────────────
  document.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : "";
      if (text.length > 2) {
        removeTooltip();
        speakSelection();
      } else {
        toggleSpeaking();
      }
    }
    // Alt+T still toggles full page
    if (e.altKey && (e.key === "t" || e.key === "T")) {
      e.preventDefault();
      toggleSpeaking();
    }
  });

  // Override notifyStatus so stopping hides mini bar
  const _origNotify = notifyStatus;
  function notifyStatusWithBar(text, isPlaying) {
    _origNotify(text, isPlaying);
    if (!isPlaying && _miniBar) hideMiniBar();
  }

  // Patch STATE to use new notifyStatus
  STATE._notifyFn = notifyStatusWithBar;

  // ─── Expose on NV namespace ───────────────────────────────────────────────────
  NV.tts = {
    speakText,
    speakPage,
    speakElement,
    speakSelection,
    stopSpeaking,
    pauseSpeaking,
    resumeSpeaking,
    toggleSpeaking,
    getVoices,
    setVoice,
    setRate,
    setPitch,
    setVolume,
    onStatusChange,
    isActive,
  };
})();
