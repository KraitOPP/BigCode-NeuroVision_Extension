/**
 * NeuroVision — Popup: settings render and persistence (profiles, toggles).
 */
(function () {
  "use strict";

  const p = window.NVPopup;

  // Debounce map for storage writes (keyed by setting path)
  const _settingDebounceTimers = {};

  p.applySettingChange = function applySettingChange(path, value) {
    // 1. Update local settings state immediately
    if (p.settings) {
      p.setNestedKey(p.settings, path, value);
    }
    // 2. Push change to content script immediately (no await — fire and forget)
    if (p.settings && p.activeTab?.id) {
      p.sendToTab(p.activeTab.id, p.MSG.SETTINGS_UPDATED, { settings: structuredClone(p.settings) });
    }
    // 3. Debounce the actual storage write to avoid queuing on rapid clicks
    clearTimeout(_settingDebounceTimers[path]);
    _settingDebounceTimers[path] = setTimeout(async () => {
      const resp = await p.send(p.MSG.UPDATE_SETTING, { path, value });
      if (resp?.success) p.settings = resp.data;
    }, 150);
  };

  p.applyProfileChange = async function applyProfileChange(profile, enabled) {
    // 1. Update local state and UI immediately
    if (p.settings) {
      p.settings.profiles[profile] = enabled;
      if (enabled) p.settings.enabled = true;
      p.renderSettings(p.settings);
    }
    // 2. Push to content script immediately
    if (p.settings && p.activeTab?.id) {
      p.sendToTab(p.activeTab.id, p.MSG.SETTINGS_UPDATED, { settings: structuredClone(p.settings) });
    }
    // 3. Persist in background (fire and forget — UI already updated)
    p.send(p.MSG.APPLY_PROFILE, { profile, enabled }).then((resp) => {
      if (resp?.success) p.settings = resp.data;
    });
  };

  p.renderSettings = function renderSettings(settings) {
    if (!settings) return;

    p.$("main-toggle").checked = settings.enabled ?? false;

    // Update profile toggle state only — detailed settings are always
    // visible inside the Advanced panel, not gated by profile active state
    ["adhd", "autism", "dyslexia"].forEach((profile) => {
      const row = p.$(`profile-${profile}`);
      if (!row) return;
      const isOn = settings.profiles?.[profile] ?? false;
      row.setAttribute("aria-pressed", String(isOn));
    });

    p.renderToggles(settings, "adhd", [
      "readingRuler", "focusTunnel", "removeAds",
      "removeAnimations", "contentChunking", "highlightKeywords", "showReadingTime",
    ]);

    p.renderToggles(settings, "autism", [
      "removeAnimations", "consistentSpacing",
      "hideDecorativeImages", "softContrast", "idiomDecoder", "toneIndicators",
    ]);
    const dial = settings.autism?.sensorDial ?? 50;
    const dialEl = p.$("sensory-dial");
    if (dialEl) {
      dialEl.value = dial;
      p.$("sensory-dial-value").textContent = dial;
    }

    p.renderToggles(settings, "dyslexia", [
      "readingRuler", "syllableHighlight", "beelineColors", "colorOverlay",
    ]);
    const fontChoice = p.$("font-choice");
    if (fontChoice) fontChoice.value = settings.dyslexia?.fontChoice || "lexend";

    const fontSizeEl = p.$("font-size-slider");
    if (fontSizeEl) {
      fontSizeEl.value = settings.dyslexia?.fontSize ?? 18;
      p.$("font-size-value").textContent = settings.dyslexia?.fontSize ?? 18;
    }

    const lineHeightEl = p.$("line-height-slider");
    if (lineHeightEl) {
      lineHeightEl.value = settings.dyslexia?.lineHeight ?? 1.8;
      p.$("line-height-value").textContent = parseFloat(settings.dyslexia?.lineHeight ?? 1.8).toFixed(1);
    }

    const overlayColor = p.$("overlay-color");
    if (overlayColor) {
      overlayColor.value = settings.dyslexia?.overlayColor || "#FFFDE7";
    }

    p.renderFeatureTags(settings);
  };

  const FONT_LABELS = { lexend: "Lexend font", atkinson: "Atkinson Hyperlegible font", opendyslexic: "OpenDyslexic font" };

  p.renderFeatureTags = function renderFeatureTags(settings) {
    const container = p.$("feature-tags");
    if (!container) return;
    container.innerHTML = "";

    function tag(icon, text) {
      const el = document.createElement("span");
      el.className = "nv-feature-tag";
      el.textContent = `${icon} ${text}`;
      container.appendChild(el);
    }

    if (settings.profiles?.adhd) {
      if (settings.adhd?.readingRuler)      tag("📏", "Reading ruler");
      if (settings.adhd?.focusTunnel)       tag("🔦", "Focus tunnel");
      if (settings.adhd?.removeAds)         tag("🚫", "No ads");
      if (settings.adhd?.removeAnimations)  tag("🧊", "No animations");
      if (settings.adhd?.contentChunking)   tag("🔲", "Section breaks");
      if (settings.adhd?.highlightKeywords) tag("🔑", "Key terms");
    }

    if (settings.profiles?.autism) {
      if (settings.autism?.removeAnimations)   tag("🧊", "No animations");
      if (settings.autism?.softContrast)       tag("🌫", "Soft contrast");
      if (settings.autism?.idiomDecoder)       tag("💬", "Idiom decoder");
      if (settings.autism?.toneIndicators)     tag("🏷️", "Tone indicators");
      if (settings.autism?.consistentSpacing)  tag("↔", "Even spacing");
    }

    if (settings.profiles?.dyslexia) {
      const font = settings.dyslexia?.fontChoice || "lexend";
      tag("🔤", FONT_LABELS[font] || font);
      const fs = settings.dyslexia?.fontSize;
      if (fs && fs !== 18) tag("🔠", `Font size ${fs}px`);
      const lh = settings.dyslexia?.lineHeight;
      if (lh && lh !== 1.8) tag("↕", `Line height ${parseFloat(lh).toFixed(1)}`);
      if (settings.dyslexia?.readingRuler)     tag("📏", "Reading ruler");
      if (settings.dyslexia?.syllableHighlight) tag("🌈", "Syllable rainbow");
      if (settings.dyslexia?.beelineColors)    tag("🌈", "Beeline gradient");
      if (settings.dyslexia?.colorOverlay)     tag("🟡", "Reading tint");
    }
  };

  p.renderToggles = function renderToggles(settings, section, keys) {
    keys.forEach((key) => {
      const el = document.querySelector(`[data-path="${section}.${key}"]`);
      if (el && el.type === "checkbox") {
        el.checked = settings[section]?.[key] ?? false;
      }
    });
  };
})();
