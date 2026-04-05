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

    ["adhd", "autism", "dyslexia"].forEach((profile) => {
      const card = p.$(`profile-${profile}`);
      if (!card) return;
      const isOn = settings.profiles?.[profile] ?? false;
      card.setAttribute("aria-pressed", String(isOn));
      card.querySelector(".nv-profile-badge").textContent = isOn ? "ON" : "OFF";

      const panel = p.$(`settings-${profile}`);
      if (panel) panel.hidden = !isOn;
    });

    p.renderToggles(settings, "adhd", [
      "readingRuler", "focusTunnel", "removeAds",
      "removeAnimations", "contentChunking", "highlightKeywords", "showReadingTime",
    ]);

    p.renderToggles(settings, "autism", [
      "removeAnimations", "removeFlashing", "consistentSpacing",
      "hideDecorativeImages", "softContrast",
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
      p.$("line-height-value").textContent = settings.dyslexia?.lineHeight ?? 1.8;
    }

    const overlayColor = p.$("overlay-color");
    if (overlayColor) {
      overlayColor.value = settings.dyslexia?.overlayColor || "#FFFDE7";
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
