/**
 * tests/coverage.test.ts — LIT-ratio regression guards.
 *
 * Fails if a vocab change, morphology change, or function-word edit degrades
 * coverage below the recorded baseline. Runs against committed fixtures
 * (tests/fixtures/coverage-{en,ar}.txt — 150 stratified sentences each, sampled
 * from the eval-10k sets), so the gate is CI-portable and does NOT depend on the
 * gitignored plan/data corpora.
 *
 * Baselines (measured 2026-06-09, after root-reduction + curated-root vocab):
 *   English: 12.5%  →  threshold 0.16
 *   Arabic : 29.1%  →  threshold 0.34
 *
 * NOTE on the Arabic threshold: the eval corpus is Wikipedia/historical text,
 * dense with proper nouns (people, places, organizations) that a tokenizer
 * SHOULD leave as LIT — so a meaningful floor of "correct LIT" is baked in.
 * This is a regression guard, not an aspiration to drive LIT arbitrarily low.
 *
 * To tighten after intentional improvements: re-measure, then lower the
 * toBeLessThan() value to (new_baseline + ~0.04) and update this comment.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tokenize } from "../src/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));

function loadFixture(lang: "en" | "ar"): string[] {
  return readFileSync(resolve(__dir, "fixtures", `coverage-${lang}.txt`), "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function litRatio(
  sentences: string[],
  lang: "en" | "ar",
): { ratio: number; total: number; lit: number } {
  let total = 0;
  let lit = 0;
  for (const text of sentences) {
    const { coverage } = tokenize(text, lang);
    total += coverage.total;
    lit += coverage.lit;
  }
  return { ratio: total > 0 ? lit / total : 0, total, lit };
}

describe("Coverage regression guard — English", () => {
  const sentences = loadFixture("en");

  test("fixture is present", () => {
    expect(sentences.length).toBeGreaterThanOrEqual(140);
  });

  test("aggregate LIT ratio < 0.16  (baseline 12.5%)", () => {
    const { ratio, total, lit } = litRatio(sentences, "en");
    if (ratio >= 0.16) {
      console.error(`EN LIT regression: ${(ratio * 100).toFixed(2)}% (${lit}/${total})`);
    }
    expect(ratio).toBeLessThan(0.16);
  });
});

describe("Coverage regression guard — Arabic MSA", () => {
  const sentences = loadFixture("ar");

  test("fixture is present", () => {
    expect(sentences.length).toBeGreaterThanOrEqual(140);
  });

  test("aggregate LIT ratio < 0.34  (baseline 29.1%; proper-noun floor)", () => {
    const { ratio, total, lit } = litRatio(sentences, "ar");
    if (ratio >= 0.34) {
      console.error(`AR LIT regression: ${(ratio * 100).toFixed(2)}% (${lit}/${total})`);
    }
    expect(ratio).toBeLessThan(0.34);
  });
});
