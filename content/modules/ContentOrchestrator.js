/**
 * NeuroVision — Content script: settings load, profile activation, auto-simplify.
 */
(function () {
  "use strict";

  const NV = (window.NeuroVision = window.NeuroVision || {});

  const S = () => NV.contentState;

  async function init() {
    if (S().initialized) return;
    S().initialized = true;

    NV.contentMessaging.setup();

    try {
      S().settings = await NV.storage.getForDomain(window.location.href);
    } catch (err) {
      console.warn("[NV] Could not load settings:", err);
      return;
    }

    if (!S().settings.enabled) return;
    await enableFeatures(S().settings);
  }

  async function enableFeatures(settings) {
    if (settings.llm?.ollamaUrl) {
      NV.ollama.configure(settings.llm.ollamaUrl, settings.llm.model);
    }

    if (!S().metrics) {
      S().metrics = NV.readabilityScorer.computeMetrics();
    }

    await activateProfiles(settings);

    if (settings.llm?.enabled && settings.llm?.autoSimplify) {
      await autoSimplify();
    }
  }

  async function activateProfiles(settings) {
    const { profiles } = settings;
    if (profiles.adhd)     await NV.adhd.activate(settings.adhd, S().metrics);
    if (profiles.autism)   await NV.autism.activate(settings.autism);
    if (profiles.dyslexia) await NV.dyslexia.activate(settings.dyslexia);
  }

  async function deactivateAllProfiles() {
    await NV.adhd.deactivate();
    await NV.autism.deactivate();
    await NV.dyslexia.deactivate();
  }

  let _settingsChangeTimer = null;
  let _pendingSettings = null;

  async function handleSettingsChange(newSettings) {
    // Queue the latest settings and debounce rapid-fire calls
    _pendingSettings = newSettings;
    if (_settingsChangeTimer) return; // already scheduled, just updated the queued value

    _settingsChangeTimer = setTimeout(async () => {
      const toApply = _pendingSettings;
      _pendingSettings = null;
      _settingsChangeTimer = null;
      await _applySettingsChange(toApply);
    }, 50);
  }

  async function _applySettingsChange(newSettings) {
    const prev = S().settings;
    S().settings = NV.storage.deepMerge(NV.storage.DEFAULT_SETTINGS, newSettings);

    if (!S().settings.enabled) {
      await deactivateAllProfiles();
      return;
    }

    if (!S().metrics) {
      S().metrics = NV.readabilityScorer.computeMetrics();
    }

    if (S().settings.llm?.ollamaUrl) {
      NV.ollama.configure(S().settings.llm.ollamaUrl, S().settings.llm.model);
    }

    if (S().settings.profiles.adhd) {
      if (!NV.adhd.isActive()) {
        await NV.adhd.activate(S().settings.adhd, S().metrics);
      } else {
        refreshModuleSettings(NV.adhd, prev?.adhd, S().settings.adhd);
      }
    } else if (NV.adhd.isActive()) {
      await NV.adhd.deactivate();
    }

    if (S().settings.profiles.autism) {
      if (!NV.autism.isActive()) {
        await NV.autism.activate(S().settings.autism);
      } else {
        refreshModuleSettings(NV.autism, prev?.autism, S().settings.autism);
      }
    } else if (NV.autism.isActive()) {
      await NV.autism.deactivate();
    }

    if (S().settings.profiles.dyslexia) {
      if (!NV.dyslexia.isActive()) {
        await NV.dyslexia.activate(S().settings.dyslexia);
      } else {
        refreshModuleSettings(NV.dyslexia, prev?.dyslexia, S().settings.dyslexia);
      }
    } else if (NV.dyslexia.isActive()) {
      await NV.dyslexia.deactivate();
    }
  }

  function refreshModuleSettings(module, prevSection, newSection) {
    if (!prevSection || !newSection) return;
    for (const key of Object.keys(newSection)) {
      if (prevSection[key] !== newSection[key]) {
        module.updateSetting(key, newSection[key]);
      }
    }
  }

  async function autoSimplify() {
    if (!S().metrics?.mainElement) return;
    const targetGrade = S().settings.llm?.targetGrade ?? 8;
    if (S().metrics.readingGrade <= targetGrade) return;

    const paragraphs = Array.from(S().metrics.mainElement.querySelectorAll("p")).slice(0, 5);
    for (const para of paragraphs) {
      const text = para.innerText || "";
      if (text.split(/\s+/).length < 20) continue;
      try {
        const simplified = await NV.ollama.simplifyText(text, targetGrade);
        if (simplified && simplified !== text) {
          para.setAttribute("data-nv-original", text);
          para.innerHTML = `${simplified}
            <button class="nv-restore-btn" title="Show original" aria-label="Show original">↩</button>`;
          para.querySelector(".nv-restore-btn")?.addEventListener("click", () => {
            para.textContent = para.getAttribute("data-nv-original");
          });
        }
      } catch { /* LLM unavailable */ }
    }
  }

  NV.contentOrchestrator = {
    init,
    enableFeatures,
    handleSettingsChange,
    deactivateAllProfiles,
    autoSimplify,
  };
})();
