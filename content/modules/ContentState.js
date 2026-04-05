/**
 * NeuroVision — Content script shared state (settings, metrics, init flag).
 */
(function () {
  "use strict";

  const NV = (window.NeuroVision = window.NeuroVision || {});

  NV.contentState = {
    settings: null,
    metrics: null,
    initialized: false,
  };
})();
