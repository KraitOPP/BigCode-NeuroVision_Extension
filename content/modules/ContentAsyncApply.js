/**
 * NeuroVision — Async simplify/summary on the page (transform-style overlay + parallel LLM).
 */
(function () {
  "use strict";

  const NV = (window.NeuroVision = window.NeuroVision || {});

  const SIMPLIFY_CONCURRENCY = 4;
  const SUMMARY_CONCURRENCY = 3;
  const SUMMARY_CHUNK = 1800;

  let _job = null;

  function abortJob() {
    if (_job) {
      _job.aborted = true;
      _job = null;
    }
  }

  function makeCancelled(job) {
    return () => job.aborted;
  }

  async function runPool(tasks, limit, onProgress) {
    const results = new Array(tasks.length);
    let index = 0;
    let done = 0;

    async function worker() {
      while (true) {
        const i = index++;
        if (i >= tasks.length) break;
        try {
          results[i] = await tasks[i]();
        } catch (e) {
          results[i] = { error: e };
        }
        done++;
        if (onProgress) onProgress(done, tasks.length);
      }
    }

    const n = Math.min(limit, Math.max(1, tasks.length));
    await Promise.all(Array.from({ length: n }, () => worker()));
    return results;
  }

  function splitTextChunks(text, maxLen) {
    const t = (text || "").trim();
    if (!t) return [];
    const chunks = [];
    let rest = t;
    while (rest.length > 0) {
      if (rest.length <= maxLen) {
        chunks.push(rest);
        break;
      }
      let cut = rest.lastIndexOf(". ", maxLen);
      if (cut < maxLen * 0.45) cut = rest.lastIndexOf("\n", maxLen);
      if (cut < maxLen * 0.45) cut = maxLen;
      chunks.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    return chunks.filter((c) => c.length > 60);
  }

  function splitSelectionBlocks(text) {
    return (text || "")
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.split(/\s+/).length > 12);
  }

  async function startSimplify(payload) {
    abortJob();
    const job = { aborted: false };
    _job = job;
    const cancelled = makeCancelled(job);

    const targetGrade = payload.targetGrade ?? NV.contentState.settings?.llm?.targetGrade ?? 8;
    const mode = payload.mode === "selection" ? "selection" : "page";

    const overlay = NV.contentLoadingOverlay.create({
      title: "✏️ Simplifying…",
      compact: true,
      onCancel: () => {
        abortJob();
      },
    });
    document.body.appendChild(overlay);
    await new Promise((r) => requestAnimationFrame(r));

    const update = (pct, msg) => NV.contentLoadingOverlay.update(overlay, pct, 100, msg);

    try {
      NV.contentPageApply.injectPageStyles();

      const S = NV.contentState;
      if (!S.metrics) {
        try { S.metrics = NV.readabilityScorer.computeMetrics(); } catch { /* ok */ }
      }

      if (mode === "selection") {
        const selText = (payload.text || "").trim();
        if (!selText) {
          update(100, "No selection");
          throw new Error("No selection text");
        }

        const blocks = splitSelectionBlocks(selText);
        const toRun = blocks.length ? blocks : [selText];

        update(5, `${toRun.length} section(s) — updating the page as each part finishes…`);

        const slot = new Array(toRun.length);
        const tasks = toRun.map((block, i) => () =>
          NV.ollama.simplifyText(block, targetGrade).then((out) => {
            if (cancelled()) return null;
            slot[i] = typeof out === "string" ? out : "";

            const prefix = [];
            for (let j = 0; j < slot.length; j++) {
              if (slot[j] == null) break;
              prefix.push(slot[j]);
            }
            const combined = prefix.join("\n\n");
            if (combined.trim()) NV.contentPageApply.applySimplifyToPage(combined);

            const ready = prefix.length;
            const pct = 8 + Math.round((ready / toRun.length) * 88);
            update(
              pct,
              ready < toRun.length
                ? `Preview on page: ${ready}/${toRun.length} sections from the start…`
                : `All ${ready} sections merged on the page…`
            );
            return out;
          })
        );

        const simplified = await runPool(tasks, SIMPLIFY_CONCURRENCY, null);

        if (cancelled()) return;

        const err = simplified.find((r) => r && r.error);
        if (err) throw err.error;

        const finalParts = [];
        for (let j = 0; j < slot.length; j++) {
          if (slot[j] != null && String(slot[j]).trim()) finalParts.push(slot[j]);
        }
        const merged = finalParts.join("\n\n");
        if (merged.trim()) NV.contentPageApply.applySimplifyToPage(merged);
        update(100, "Done — scroll the page to review");
        return;
      }

      // Page mode: parallel per <p>
      const { element: mainEl } = NV.readabilityScorer.extractMainContent();
      if (!mainEl) throw new Error("No readable content");

      NV.contentPageApply.clearSimplificationsInElement(mainEl);

      const paras = Array.from(mainEl.querySelectorAll("p")).filter(
        (p) => (p.innerText || "").split(/\s+/).length > 15
      );

      if (!paras.length) {
        const fallback = (S.metrics?.mainText || "").slice(0, 4000);
        if (!fallback.trim()) throw new Error("No paragraphs to simplify");
        update(25, "Simplifying article — result will appear on the page…");
        const one = await NV.ollama.simplifyText(fallback, targetGrade);
        if (cancelled()) return;
        NV.contentPageApply.applySimplifyToPage(one);
        update(100, "Done — scroll to read");
        return;
      }

      update(
        6,
        `${paras.length} paragraphs — watch them update below as each one finishes…`
      );

      const tasks = paras.map((para) => () => {
        const raw = para.innerText || "";
        return NV.ollama.simplifyText(raw, targetGrade).then((out) => {
          if (cancelled()) return null;
          if (out && out.trim() && out.trim() !== raw.trim()) {
            NV.contentPageApply.applySimplifyToOneParagraph(para, out, { flash: true });
          }
          return out;
        });
      });

      const paraResults = await runPool(tasks, SIMPLIFY_CONCURRENCY, (done, total) => {
        const pct = 10 + Math.round((done / total) * 88);
        update(pct, `Updated ${done}/${total} paragraphs on the page…`);
      });

      const paraErr = paraResults.find((r) => r && r.error);
      if (paraErr) throw paraErr.error;

      if (cancelled()) return;
      update(100, "Done — keep reading");
    } catch (err) {
      if (!cancelled()) {
        NV.contentAiPanel.injectStyles();
        NV.contentAiPanel.show("⚠️ Simplify failed", err.message || String(err), false);
      }
    } finally {
      if (_job === job) _job = null;
      setTimeout(() => overlay.remove(), 700);
    }
  }

  async function startSummarize(_payload) {
    abortJob();
    const job = { aborted: false };
    _job = job;
    const cancelled = makeCancelled(job);

    const overlay = NV.contentLoadingOverlay.create({
      title: "📋 Summary",
      compact: true,
      onCancel: () => {
        abortJob();
        const c = document.getElementById("nv-summary-card");
        if (c?.getAttribute("data-nv-live") != null) c.remove();
      },
    });
    document.body.appendChild(overlay);
    await new Promise((r) => requestAnimationFrame(r));

    const update = (pct, msg) => NV.contentLoadingOverlay.update(overlay, pct, 100, msg);

    try {
      NV.contentPageApply.injectPageStyles();

      const S = NV.contentState;
      if (!S.metrics) {
        try { S.metrics = NV.readabilityScorer.computeMetrics(); } catch { /* ok */ }
      }

      const full = (S.metrics?.mainText || "").trim();
      if (!full) throw new Error("No page text to summarize");

      const chunks = splitTextChunks(full, SUMMARY_CHUNK);
      const seen = new Set();

      const card = NV.contentPageApply.ensureLiveSummaryCard();
      if (!card) throw new Error("Could not add summary to this page");

      update(
        8,
        chunks.length > 1
          ? `Building summary — bullets appear above as ${chunks.length} parts finish…`
          : "Writing summary card above…"
      );

      const tasks = chunks.map((chunk) => () =>
        NV.ollama.summarizeText(chunk).then((text) => {
          if (cancelled()) return null;
          NV.contentPageApply.appendSummaryBulletsIncremental(text, seen);
          return text;
        })
      );

      const partials = await runPool(tasks, SUMMARY_CONCURRENCY, (done, total) => {
        const pct = 10 + Math.round((done / total) * 82);
        update(
          pct,
          `${seen.size} bullet point${seen.size === 1 ? "" : "s"} so far • part ${done}/${total}`
        );
      });

      if (cancelled()) return;

      const err = partials.find((r) => r && r.error);
      if (err) throw err.error;

      if (!seen.size) throw new Error("Empty summary");

      NV.contentPageApply.finalizeLiveSummaryCard();
      update(100, "Summary ready — scroll up");
    } catch (err) {
      if (!cancelled()) {
        document.getElementById("nv-summary-card")?.remove();
        NV.contentAiPanel.injectStyles();
        NV.contentAiPanel.show("⚠️ Summary failed", err.message || String(err), false);
      }
    } finally {
      if (_job === job) _job = null;
      setTimeout(() => overlay.remove(), 700);
    }
  }

  NV.contentAsyncApply = {
    startSimplify,
    startSummarize,
    abortJob,
  };
})();
