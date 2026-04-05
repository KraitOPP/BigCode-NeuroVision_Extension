/**
 * NeuroVision — Evaluation Framework
 *
 * Runs the evaluation dataset against our algorithms and reports metrics.
 * Open tests/test_runner.html (add this script tag) or run in Node.js.
 *
 * Outputs:
 * - Accuracy scores per algorithm
 * - Performance timing
 * - Error analysis
 */

(function () {
  const NV = window.NeuroVision;
  const alg = NV.algorithms;

  // ─── Load Dataset ──────────────────────────────────────────────────────────
  // In browser, dataset is loaded via fetch. In Node.js, via require.
  async function loadDataset() {
    if (typeof fetch !== "undefined") {
      const resp = await fetch("./evaluation_dataset.json");
      return await resp.json();
    } else {
      return require("./evaluation_dataset.json");
    }
  }

  // ─── Report Builder ───────────────────────────────────────────────────────
  const report = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    errors: [],
    sections: {},
  };

  function recordResult(section, label, passed, details = "") {
    report.totalTests++;
    if (!report.sections[section]) {
      report.sections[section] = { passed: 0, failed: 0, tests: [] };
    }
    if (passed) {
      report.passed++;
      report.sections[section].passed++;
    } else {
      report.failed++;
      report.sections[section].failed++;
      report.errors.push({ section, label, details });
    }
    report.sections[section].tests.push({ label, passed, details });
  }

  // ─── Readability Evaluation ───────────────────────────────────────────────
  function evaluateReadability(samples) {
    let gradeErrors = [];

    samples.forEach((sample) => {
      const grade = alg.fleschKincaidGrade(sample.text);
      const ease = alg.fleschReadingEase(sample.text);

      if (sample.expected_grade_max !== undefined) {
        const ok = grade <= sample.expected_grade_max;
        recordResult(
          "Readability",
          `[${sample.id}] ${sample.label} — grade ≤ ${sample.expected_grade_max}`,
          ok,
          ok ? "" : `got ${grade}`
        );
        if (!ok) gradeErrors.push({ id: sample.id, expected: `≤${sample.expected_grade_max}`, got: grade });
      }

      if (sample.expected_grade_min !== undefined) {
        const ok = grade >= sample.expected_grade_min;
        recordResult(
          "Readability",
          `[${sample.id}] ${sample.label} — grade ≥ ${sample.expected_grade_min}`,
          ok,
          ok ? "" : `got ${grade}`
        );
      }

      if (sample.expected_ease_min !== undefined) {
        const ok = ease >= sample.expected_ease_min;
        recordResult(
          "Readability",
          `[${sample.id}] ${sample.label} — ease ≥ ${sample.expected_ease_min}`,
          ok,
          ok ? "" : `got ${ease}`
        );
      }

      if (sample.expected_ease_max !== undefined) {
        const ok = ease <= sample.expected_ease_max;
        recordResult(
          "Readability",
          `[${sample.id}] ${sample.label} — ease ≤ ${sample.expected_ease_max}`,
          ok,
          ok ? "" : `got ${ease}`
        );
      }
    });

    return gradeErrors;
  }

  // ─── Cognitive Load Evaluation ────────────────────────────────────────────
  function evaluateCognitiveLoad(samples) {
    samples.forEach((sample) => {
      const load = alg.computeCognitiveLoad(sample.metrics);

      if (sample.expected_load_max !== undefined) {
        const ok = load <= sample.expected_load_max;
        recordResult(
          "CognitiveLoad",
          `[${sample.id}] ${sample.label} — load ≤ ${sample.expected_load_max}`,
          ok,
          ok ? "" : `got ${load}`
        );
      }

      if (sample.expected_load_min !== undefined) {
        const ok = load >= sample.expected_load_min;
        recordResult(
          "CognitiveLoad",
          `[${sample.id}] ${sample.label} — load ≥ ${sample.expected_load_min}`,
          ok,
          ok ? "" : `got ${load}`
        );
      }
    });
  }

  // ─── Syllable Evaluation ──────────────────────────────────────────────────
  function evaluateSyllables(samples) {
    let totalError = 0;
    let count = 0;

    samples.forEach((sample) => {
      const syllables = alg.splitIntoSyllables(sample.word);
      const countedSyls = alg.countSyllables(sample.word);
      const tolerance = 1; // Allow ±1 syllable error
      const ok = Math.abs(countedSyls - sample.expected_syllables) <= tolerance;

      recordResult(
        "Syllables",
        `"${sample.word}" has ~${sample.expected_syllables} syllable(s)`,
        ok,
        ok ? "" : `counted ${countedSyls}`
      );

      totalError += Math.abs(countedSyls - sample.expected_syllables);
      count++;
    });

    const mae = totalError / count;
    console.log(`  📊 Syllable counting MAE: ${mae.toFixed(2)} (lower is better)`);
  }

  // ─── Performance Benchmark ────────────────────────────────────────────────
  function benchmarkPerformance() {
    const longText = Array(100)
      .fill("The scientists discovered a new method for analyzing complex data structures.")
      .join(" ");

    const iterations = 50;

    // FK Grade
    const t1 = performance.now();
    for (let i = 0; i < iterations; i++) alg.fleschKincaidGrade(longText);
    const fkTime = (performance.now() - t1) / iterations;

    // Cognitive Load
    const metrics = {
      readingGrade: 10, wordCount: 500, uniqueColors: 8,
      animationCount: 2, adCount: 3, linkDensity: 0.1, nestedDepth: 8,
    };
    const t2 = performance.now();
    for (let i = 0; i < iterations * 10; i++) alg.computeCognitiveLoad(metrics);
    const clTime = (performance.now() - t2) / (iterations * 10);

    // Chunk text
    const t3 = performance.now();
    for (let i = 0; i < iterations; i++) alg.chunkText(longText, 80);
    const chunkTime = (performance.now() - t3) / iterations;

    console.log(`\n  ⏱️  Performance Benchmarks (avg over ${iterations} runs):`);
    console.log(`     FK Grade:        ${fkTime.toFixed(2)}ms per call`);
    console.log(`     Cognitive Load:  ${clTime.toFixed(3)}ms per call`);
    console.log(`     Text Chunking:   ${chunkTime.toFixed(2)}ms per call`);

    // Performance assertions (should be fast enough for real-time use)
    recordResult(
      "Performance",
      `FK Grade < 10ms (got ${fkTime.toFixed(2)}ms)`,
      fkTime < 10
    );
    recordResult(
      "Performance",
      `Cognitive Load < 1ms (got ${clTime.toFixed(3)}ms)`,
      clTime < 1
    );
    recordResult(
      "Performance",
      `Text Chunking < 10ms (got ${chunkTime.toFixed(2)}ms)`,
      chunkTime < 10
    );
  }

  // ─── LLM Quality Evaluation (without Ollama) ─────────────────────────────
  // Tests prompt generation and output quality criteria
  function evaluateLLMPrompts(benchmarks) {
    benchmarks.forEach((bench) => {
      // Test that our simplification targets are measurable
      bench.acceptable_outputs.forEach((output, i) => {
        const grade = alg.fleschKincaidGrade(output);
        const wordsPerSentence = alg.tokenizeWords(output).length /
          Math.max(1, alg.tokenizeSentences(output).length);
        const avgSyl = alg.tokenizeWords(output).reduce(
          (sum, w) => sum + alg.countSyllables(w), 0
        ) / Math.max(1, alg.tokenizeWords(output).length);

        const criteria = bench.quality_criteria;
        const sylOk = avgSyl <= criteria.max_avg_syllables_per_word;
        const wordsOk = wordsPerSentence <= criteria.max_avg_words_per_sentence;

        recordResult(
          "LLMQuality",
          `[${bench.id}] Sample output ${i + 1}: avg syl/word ≤ ${criteria.max_avg_syllables_per_word}`,
          sylOk,
          sylOk ? "" : `got ${avgSyl.toFixed(2)}`
        );
        recordResult(
          "LLMQuality",
          `[${bench.id}] Sample output ${i + 1}: words/sentence ≤ ${criteria.max_avg_words_per_sentence}`,
          wordsOk,
          wordsOk ? "" : `got ${wordsPerSentence.toFixed(1)}`
        );
      });
    });
  }

  // ─── Print Report ─────────────────────────────────────────────────────────
  function printReport() {
    const passRate = ((report.passed / report.totalTests) * 100).toFixed(1);

    console.log("\n" + "═".repeat(50));
    console.log("📊 NEUROVISION EVALUATION REPORT");
    console.log("═".repeat(50));
    console.log(`Total Tests:  ${report.totalTests}`);
    console.log(`Passed:       ${report.passed} ✅`);
    console.log(`Failed:       ${report.failed} ❌`);
    console.log(`Pass Rate:    ${passRate}%`);
    console.log("\nSection Breakdown:");

    Object.entries(report.sections).forEach(([section, data]) => {
      const sectionRate = ((data.passed / (data.passed + data.failed)) * 100).toFixed(0);
      console.log(`  ${section.padEnd(20)} ${sectionRate}% (${data.passed}/${data.passed + data.failed})`);
    });

    if (report.errors.length > 0) {
      console.log("\n⚠️  Failures:");
      report.errors.forEach((err) => {
        console.error(`  [${err.section}] ${err.label}${err.details ? ` — ${err.details}` : ""}`);
      });
    }

    if (parseFloat(passRate) >= 90) {
      console.log("\n🎉 Evaluation PASSED (≥ 90% pass rate)");
    } else if (parseFloat(passRate) >= 75) {
      console.log("\n⚠️  Evaluation PARTIAL (75-90% pass rate)");
    } else {
      console.error("\n❌ Evaluation FAILED (< 75% pass rate)");
    }
  }

  // ─── Main ─────────────────────────────────────────────────────────────────
  async function runEvaluation() {
    console.log("🧠 NeuroVision Evaluation Suite\n");

    let dataset;
    try {
      dataset = await loadDataset();
    } catch (err) {
      console.error("Could not load evaluation dataset:", err);
      return;
    }

    console.log("📚 Readability Scoring:");
    evaluateReadability(dataset.readability_samples);

    console.log("\n🧩 Cognitive Load Calculation:");
    evaluateCognitiveLoad(dataset.cognitive_load_samples);

    console.log("\n🔤 Syllable Splitting:");
    evaluateSyllables(dataset.syllable_split_samples);

    console.log("\n✏️  LLM Output Quality (pre-verified samples):");
    evaluateLLMPrompts(dataset.llm_simplification_benchmarks);

    console.log("\n⏱️  Performance:");
    benchmarkPerformance();

    printReport();
  }

  // Run
  runEvaluation().catch(console.error);
  window.NVEvaluation = { runEvaluation, report };
})();
