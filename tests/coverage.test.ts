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
 * NOTE on the Arabic threshold: AR LIT measured ~26–28% across three
 * independent corpora — Wikipedia (28.3%), everyday Tatoeba MSA (26.1%), and
 * dialectal/social text (37.8%). So the gap is NOT a Wikipedia proper-noun
 * artifact; it is genuine breadth coverage (vocabulary + function words + verb
 * morphology). Driving it below ~20% needs real coverage work (weak-root
 * morphology, a larger curated root set), not metric tuning. This is a
 * regression guard at the current honest baseline.
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
