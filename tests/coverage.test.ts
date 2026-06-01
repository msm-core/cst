/**
 * tests/coverage.test.ts — LIT-ratio regression guards.
 *
 * These tests fail if a vocab change, morphological rule change, or function-
 * word edit accidentally degrades coverage below the recorded baseline.
 *
 * Methodology:
 *   - Every 20th entry from eval-en-10k.json and eval-ar-10k.json gives a
 *     500-sentence stratified sample that is fast to run (~2s) and
 *     representative of the full distribution.
 *   - Thresholds are set 6 pp above the current measured baseline to absorb
 *     small natural variation without allowing real regressions.
 *
 * Baselines (measured 2026-06-01, build-vocab v2200/v1490 entries):
 *   English (eval-en-10k, 500-sentence sample): 13.48 %  →  threshold 0.17
 *   Arabic  (eval-ar-10k, 500-sentence sample): 35.61 %  →  threshold 0.40
 *
 * To update thresholds after intentional improvements:
 *   1. Run the lit-profiler to confirm the new baseline.
 *   2. Lower the toBeLessThan() value to (new_baseline + 0.06).
 *   3. Update the comment above.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tokenize } from "../src/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");

interface EvalItem {
  text: string;
  domain?: string;
  source?: string;
}

function loadSample(file: string, stride: number): EvalItem[] {
  const all = JSON.parse(
    readFileSync(resolve(ROOT, "plan/data", file), "utf-8"),
  ) as EvalItem[];
  return all.filter((_, i) => i % stride === 0);
}

function computeLitRatio(
  items: EvalItem[],
  lang: "en" | "ar",
): { ratio: number; totalTokens: number; litTokens: number } {
  let totalTokens = 0;
  let litTokens = 0;
  for (const { text } of items) {
    const result = tokenize(text, lang);
    totalTokens += result.coverage.total;
    litTokens += result.coverage.lit;
  }
  return {
    ratio: totalTokens > 0 ? litTokens / totalTokens : 0,
    totalTokens,
    litTokens,
  };
}

// ── English baseline ──────────────────────────────────────────────────────────

describe("Coverage regression guard — English (eval-en-10k)", () => {
  // 500 stratified sentences, ~2–3 s
  const sample = loadSample("eval-en-10k.json", 20);

  test("sample size is correct", () => {
    expect(sample.length).toBeGreaterThanOrEqual(490);
    expect(sample.length).toBeLessThanOrEqual(510);
  });

  test("aggregate LIT ratio < 0.17  (baseline: 13.48%)", () => {
    const { ratio, totalTokens, litTokens } = computeLitRatio(sample, "en");
    const pct = (ratio * 100).toFixed(2);
    // Provide a useful failure message showing current values
    expect(ratio).toBeLessThan(0.17);
    if (ratio >= 0.17) {
      console.error(
        `English LIT ratio regression: ${pct}% (${litTokens}/${totalTokens} tokens)`,
      );
    }
  });
});

// ── Arabic baseline ───────────────────────────────────────────────────────────

describe("Coverage regression guard — Arabic MSA (eval-ar-10k)", () => {
  // 500 stratified sentences, ~3–4 s
  const sample = loadSample("eval-ar-10k.json", 20);

  test("sample size is correct", () => {
    expect(sample.length).toBeGreaterThanOrEqual(490);
    expect(sample.length).toBeLessThanOrEqual(510);
  });

  test("aggregate LIT ratio < 0.40  (baseline: 35.61%)", () => {
    const { ratio, totalTokens, litTokens } = computeLitRatio(sample, "ar");
    const pct = (ratio * 100).toFixed(2);
    expect(ratio).toBeLessThan(0.4);
    if (ratio >= 0.4) {
      console.error(
        `Arabic LIT ratio regression: ${pct}% (${litTokens}/${totalTokens} tokens)`,
      );
    }
  });
});
