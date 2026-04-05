/**
 * NeuroVision — Core Algorithms
 * Readability scoring, text analysis, cognitive load calculation.
 * No external dependencies; pure JS utility functions.
 */
(function () {
  "use strict";

  const NV = (window.NeuroVision = window.NeuroVision || {});

  // ─── Syllable Counting (Vowel-transition heuristic) ────────────────────────
  function countSyllables(word) {
    word = word.toLowerCase().replace(/[^a-z]/g, "");
    if (!word.length) return 0;
    if (word.length <= 3) return 1;
    // Strip trailing e (silent)
    word = word.replace(/e$/, "");
    const matches = word.match(/[aeiouy]+/g);
    return matches ? matches.length : 1;
  }

  // ─── Tokenizers ────────────────────────────────────────────────────────────
  function tokenizeWords(text) {
    return text
      .replace(/["""'']/g, " ")
      .split(/\s+/)
      .map((w) => w.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "")) // strip leading/trailing punctuation
      .filter((w) => /[a-zA-Z]/.test(w));
  }

  function tokenizeSentences(text) {
    return text
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3);
  }

  // ─── Flesch-Kincaid Grade Level ────────────────────────────────────────────
  // FK = 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
  // Target: ≤ 8 for accessible content
  function fleschKincaidGrade(text) {
    const words = tokenizeWords(text);
    const sentences = tokenizeSentences(text);
    if (!words.length || !sentences.length) return 0;

    const totalSyllables = words.reduce(
      (sum, w) => sum + countSyllables(w),
      0
    );
    const avgWordsPerSentence = words.length / sentences.length;
    const avgSyllablesPerWord = totalSyllables / words.length;

    const grade = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;
    return Math.max(0, Math.round(grade * 10) / 10);
  }

  // ─── Flesch Reading Ease ──────────────────────────────────────────────────
  // FRE = 206.835 - 1.015*(words/sentences) - 84.6*(syllables/words)
  // 90-100: Very Easy, 60-70: Standard, 0-30: Very Difficult
  function fleschReadingEase(text) {
    const words = tokenizeWords(text);
    const sentences = tokenizeSentences(text);
    if (!words.length || !sentences.length) return 100;

    const totalSyllables = words.reduce(
      (sum, w) => sum + countSyllables(w),
      0
    );
    const score =
      206.835 -
      1.015 * (words.length / sentences.length) -
      84.6 * (totalSyllables / words.length);
    return Math.min(100, Math.max(0, Math.round(score)));
  }

  // ─── Cognitive Load Score (Novel metric) ──────────────────────────────────
  // Composite score from multiple page characteristics: 0 (easy) → 100 (hard)
  function computeCognitiveLoad(metrics) {
    const {
      readingGrade = 0,      // 0-20 → norm 0-1
      wordCount = 0,          // # words in main content
      uniqueColors = 0,       // distinct colors detected
      animationCount = 0,     // CSS animations found
      adCount = 0,            // ad/promo elements
      linkDensity = 0,        // links / words ratio
      nestedDepth = 0,        // max DOM depth in content
      imageCount = 0,         // images in content area
    } = metrics;

    // Weighted sub-scores (all normalized to 0–1)
    const gradeScore = Math.min(readingGrade / 16, 1);          // weight 0.30
    const lengthScore = Math.min(wordCount / 2000, 1);           // weight 0.15
    const colorScore = Math.min(uniqueColors / 20, 1);           // weight 0.15
    const animScore = Math.min(animationCount / 5, 1);           // weight 0.20
    const adScore = Math.min(adCount / 10, 1);                   // weight 0.10
    const linkScore = Math.min(linkDensity * 10, 1);             // weight 0.05
    const depthScore = Math.min(nestedDepth / 20, 1);            // weight 0.05

    const composite =
      gradeScore * 30 +
      lengthScore * 15 +
      colorScore * 15 +
      animScore * 20 +
      adScore * 10 +
      linkScore * 5 +
      depthScore * 5;

    return Math.round(composite);
  }

  // ─── Reading Time Estimate ─────────────────────────────────────────────────
  // Average adult: 238 WPM; Dyslexic average: ~120 WPM; ADHD with focus: ~180 WPM
  function estimateReadingTime(text, wpm = 238) {
    const words = tokenizeWords(text).length;
    const minutes = words / wpm;
    if (minutes < 1) return "< 1 min";
    return `${Math.round(minutes)} min`;
  }

  // ─── Text Chunker ─────────────────────────────────────────────────────────
  // Splits text into cognitively manageable chunks
  function chunkText(text, maxWords = 80) {
    const sentences = tokenizeSentences(text);
    const chunks = [];
    let current = [];
    let wordCount = 0;

    sentences.forEach((sentence) => {
      const words = tokenizeWords(sentence).length;
      if (wordCount + words > maxWords && current.length) {
        chunks.push(current.join(" "));
        current = [];
        wordCount = 0;
      }
      current.push(sentence);
      wordCount += words;
    });

    if (current.length) chunks.push(current.join(" "));
    return chunks;
  }

  // ─── Syllable Splitter (for Dyslexia visualization) ──────────────────────
  // Returns array of syllables for a word (heuristic vowel-cluster method)
  function splitIntoSyllables(word) {
    word = word.replace(/[^a-zA-Z]/g, "");
    if (word.length <= 3) return [word];

    const syllables = [];
    let current = "";
    let vowelFound = false;

    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      const isVowel = /[aeiouAEIOU]/.test(char);
      current += char;

      if (isVowel) {
        vowelFound = true;
      } else if (vowelFound && i < word.length - 1) {
        // Consonant after vowel — potential split point
        const nextChar = word[i + 1];
        const nextIsVowel = /[aeiouAEIOU]/.test(nextChar);
        if (nextIsVowel && current.length >= 2) {
          syllables.push(current);
          current = "";
          vowelFound = false;
        }
      }
    }

    if (current.length) syllables.push(current);
    return syllables.length ? syllables : [word];
  }

  // ─── Color Palette Reducer ─────────────────────────────────────────────────
  // Converts an RGB color to a muted/pastel version for Autism mode
  function mutedColor(r, g, b, saturationMultiplier = 0.3) {
    // Convert to HSL
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h,
      s,
      l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }

    // Reduce saturation
    s *= saturationMultiplier;
    l = 0.4 + l * 0.4; // Push lightness toward mid-range

    // Convert back to RGB
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }

    let nr, ng, nb;
    if (s === 0) {
      nr = ng = nb = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      nr = hue2rgb(p, q, h + 1 / 3);
      ng = hue2rgb(p, q, h);
      nb = hue2rgb(p, q, h - 1 / 3);
    }

    return `rgb(${Math.round(nr * 255)}, ${Math.round(ng * 255)}, ${Math.round(nb * 255)})`;
  }

  // ─── DOM Max Depth ─────────────────────────────────────────────────────────
  function getMaxDepth(element, currentDepth = 0) {
    if (!element.children.length) return currentDepth;
    return Math.max(
      ...Array.from(element.children).map((child) =>
        getMaxDepth(child, currentDepth + 1)
      )
    );
  }

  // ─── Link Density ──────────────────────────────────────────────────────────
  function getLinkDensity(element) {
    const allText = element.innerText || "";
    const linkText = Array.from(element.querySelectorAll("a"))
      .map((a) => a.innerText || "")
      .join(" ");
    if (!allText.length) return 0;
    return linkText.length / allText.length;
  }

  // ─── Unique Color Count (sampled) ─────────────────────────────────────────
  function estimateUniqueColors(rootElement) {
    const styles = new Set();
    const elements = rootElement.querySelectorAll("*");
    const sample = Array.from(elements).slice(0, 100); // Sample first 100 elements
    sample.forEach((el) => {
      const style = window.getComputedStyle(el);
      styles.add(style.color);
      styles.add(style.backgroundColor);
    });
    // Remove transparent/none
    const cleaned = Array.from(styles).filter(
      (s) => s && s !== "rgba(0, 0, 0, 0)" && s !== "transparent"
    );
    return cleaned.length;
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  NV.algorithms = {
    countSyllables,
    tokenizeWords,
    tokenizeSentences,
    fleschKincaidGrade,
    fleschReadingEase,
    computeCognitiveLoad,
    estimateReadingTime,
    chunkText,
    splitIntoSyllables,
    mutedColor,
    getMaxDepth,
    getLinkDensity,
    estimateUniqueColors,
  };
})();
