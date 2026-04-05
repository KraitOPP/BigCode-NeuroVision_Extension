/**
 * NeuroVision — Algorithm Tests
 * Run in browser console or Node.js (with minimal shims).
 *
 * Usage:
 *   - Browser: include algorithms.js then this file, open console
 *   - Node:    node tests/test_algorithms.js
 */

// ─── Node.js Shim ─────────────────────────────────────────────────────────────
if (typeof window === "undefined") {
  globalThis.window = { NeuroVision: {} };
  require("../utils/algorithms.js");
}

const alg = window.NeuroVision.algorithms;

// ─── Simple Test Runner ───────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function assertApprox(value, expected, tolerance, label) {
  assert(Math.abs(value - expected) <= tolerance, `${label} (got ${value}, expected ≈${expected})`);
}

function describe(suiteName, fn) {
  console.log(`\n📦 ${suiteName}`);
  fn();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("countSyllables", () => {
  assert(alg.countSyllables("cat") === 1, "cat = 1 syllable");
  assert(alg.countSyllables("hello") === 2, "hello = 2 syllables");
  assert(alg.countSyllables("beautiful") >= 3, "beautiful >= 3 syllables");
  assert(alg.countSyllables("") === 0, "empty string = 0");
  assert(alg.countSyllables("a") === 1, "single vowel = 1");
});

describe("tokenizeWords", () => {
  const words = alg.tokenizeWords("Hello, world! This is a test.");
  assert(words.length === 6, `tokenize 6 words (got ${words.length})`);
  assert(words.includes("Hello"), "includes Hello");
  assert(words.includes("test"), "includes test");
});

describe("tokenizeSentences", () => {
  const text = "Hello. How are you? I am fine! Great.";
  const sents = alg.tokenizeSentences(text);
  assert(sents.length >= 3, `at least 3 sentences (got ${sents.length})`);
});

describe("fleschKincaidGrade", () => {
  // Simple text should score low
  const simpleText = "The cat sat on the mat. It had a big hat. The hat was red.";
  const simpleGrade = alg.fleschKincaidGrade(simpleText);
  assert(simpleGrade < 5, `simple text grade < 5 (got ${simpleGrade})`);

  // Complex text should score higher
  const complexText =
    "The concomitant extrapolation of multifarious epistemological paradigms necessitates comprehensive examination. " +
    "Philosophical contemplation regarding phenomenological manifestations demonstrates sophisticated intellectual engagement.";
  const complexGrade = alg.fleschKincaidGrade(complexText);
  assert(complexGrade > 10, `complex text grade > 10 (got ${complexGrade})`);
});

describe("fleschReadingEase", () => {
  const simpleText = "The cat sat on the mat. It is red. I like it.";
  const complexText =
    "The sophisticated epistemological framework necessitates comprehensive understanding of multidimensional paradigmatic structures.";

  const simpleScore = alg.fleschReadingEase(simpleText);
  const complexScore = alg.fleschReadingEase(complexText);

  assert(simpleScore > 70, `simple text ease > 70 (got ${simpleScore})`);
  assert(complexScore < 50, `complex text ease < 50 (got ${complexScore})`);
  assert(simpleScore > complexScore, "simple > complex in ease");
});

describe("computeCognitiveLoad", () => {
  const easy = alg.computeCognitiveLoad({
    readingGrade: 4, wordCount: 200, uniqueColors: 3,
    animationCount: 0, adCount: 0, linkDensity: 0.05, nestedDepth: 5,
  });
  const hard = alg.computeCognitiveLoad({
    readingGrade: 14, wordCount: 3000, uniqueColors: 25,
    animationCount: 8, adCount: 15, linkDensity: 0.4, nestedDepth: 20,
  });

  assert(easy < 30, `easy page cognitive load < 30 (got ${easy})`);
  assert(hard > 60, `hard page cognitive load > 60 (got ${hard})`);
  assert(easy < hard, "easy < hard cognitive load");
});

describe("estimateReadingTime", () => {
  const shortText = "Hello world.";
  const longText = Array(500).fill("word").join(" ");

  assert(alg.estimateReadingTime(shortText) === "< 1 min", "short text < 1 min");
  const longTime = alg.estimateReadingTime(longText);
  assert(longTime !== "< 1 min", `long text is not < 1 min (got ${longTime})`);
});

describe("chunkText", () => {
  const text = Array(10)
    .fill("This is a sentence with some words in it.")
    .join(" ");
  const chunks = alg.chunkText(text, 40);
  assert(chunks.length > 1, `text split into ${chunks.length} chunks (expected > 1)`);
  chunks.forEach((chunk, i) => {
    const words = alg.tokenizeWords(chunk).length;
    // Allow some overshoot for sentence integrity
    assert(words <= 60, `chunk ${i} not excessively long (${words} words)`);
  });
});

describe("splitIntoSyllables", () => {
  const cat = alg.splitIntoSyllables("cat");
  assert(cat.length >= 1, `cat has >= 1 syllable: ${cat.join("-")}`);

  const beautiful = alg.splitIntoSyllables("beautiful");
  assert(beautiful.length >= 2, `beautiful split: ${beautiful.join("-")}`);

  const single = alg.splitIntoSyllables("a");
  assert(single.length === 1, "single letter = 1 syllable");
});

describe("mutedColor", () => {
  const muted = alg.mutedColor(255, 0, 0, 0.3);
  assert(muted.startsWith("rgb("), "returns rgb() format");
  // Should not be pure red
  assert(muted !== "rgb(255, 0, 0)", "muted differs from original");
});

describe("getLinkDensity", () => {
  // Create mock DOM element
  const div = document.createElement("div");
  div.innerHTML = `<p>Some text <a href="#">link</a> more text</p>`;
  if (typeof document !== "undefined") {
    const density = alg.getLinkDensity(div);
    assert(density >= 0 && density <= 1, `link density in [0,1] range (got ${density})`);
  }
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(40)}`);
console.log(`Total: ${passed + failed} | ✅ ${passed} passed | ❌ ${failed} failed`);
if (failed === 0) {
  console.log("🎉 All tests passed!");
} else {
  console.error(`⚠️  ${failed} test(s) failed`);
  if (typeof process !== "undefined") process.exit(1);
}
