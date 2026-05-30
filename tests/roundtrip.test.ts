/**
 * tests/roundtrip.test.ts — Detokenizer roundtrip + pipeline tests.
 *
 * Core invariant: for any input text, joining the surfaces of all tokens
 * (after filtering punctuation-only tokens) must recover every original word.
 *
 * Also tests: reconstruct(), digest(), gloss(), toLLMContext(), detectLang(),
 * and the unified tokenize() router.
 */

import { tokenizeEn } from "../src/tokenizer/en.js";
import { tokenizeAr } from "../src/tokenizer/ar.js";
import { tokenize, detectLang } from "../src/tokenizer/pipeline.js";
import {
  detokenize,
  reconstruct,
  digest,
  gloss,
  toLLMContext,
} from "../src/detokenizer.js";
import type { CSTToken } from "../src/types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract all word-level tokens from raw text (split on whitespace). */
function inputWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/** Surfaces of all tokens, joined by space (what detokenize() produces). */
function surfaceWords(tokens: CSTToken[]): string[] {
  return tokens.map((t) => t.surface);
}

// ── English roundtrip ─────────────────────────────────────────────────────────

describe("Roundtrip: English", () => {
  const sentences = [
    "write a report",
    "set an alarm for tomorrow",
    "play music",
    "I do not want to go",
    "if it rains we will stay",
    "the teacher is a good person",
    "deploy the application to the server",
  ];

  test("every token surface is a word from the original input (EN)", () => {
    for (const s of sentences) {
      const { tokens } = tokenizeEn(s);
      // Compound-bigram tokens have a surface like "play music" — both words present in input
      const inputSet = new Set(inputWords(s));
      for (const t of tokens) {
        // Each surface word must come from the original input
        for (const surfWord of t.surface.split(" ")) {
          expect(inputSet.has(surfWord)).toBe(true);
        }
      }
    }
  });

  test("detokenize() output only contains words from original input", () => {
    for (const s of sentences) {
      const { tokens } = tokenizeEn(s);
      const recovered = detokenize(tokens);
      const inputSet = new Set(inputWords(s));
      for (const word of recovered.split(" ").filter(Boolean)) {
        expect(inputSet.has(word)).toBe(true);
      }
    }
  });

  test("reconstruct() with offsets gives exact original", () => {
    const text = "write a report";
    const { tokens } = tokenizeEn(text);
    const r = reconstruct(text, tokens);
    expect(r).toBe(text);
  });

  test("no token has an empty surface (EN)", () => {
    for (const s of sentences) {
      const { tokens } = tokenizeEn(s);
      for (const t of tokens) {
        expect(t.surface.length).toBeGreaterThan(0);
      }
    }
  });

  test("all offsets are valid [start, end] within input length", () => {
    const text = "set an alarm for tomorrow";
    const { tokens } = tokenizeEn(text);
    for (const t of tokens) {
      const [start, end] = t.offset;
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeLessThanOrEqual(text.length);
      expect(end).toBeGreaterThan(start);
    }
  });

  test("compact string contains token type prefix", () => {
    const { tokens } = tokenizeEn("write a report");
    for (const t of tokens) {
      expect(t.compact).toMatch(/^(ROOT|ROLE|REL|STR|LIT):/);
    }
  });
});

// ── Arabic roundtrip ──────────────────────────────────────────────────────────

describe("Roundtrip: Arabic", () => {
  const sentences = [
    "كتب التقرير",
    "اضبط منبه الساعة سبعة",
    "ابغي اشوف فيلم",
    "ذهب الى المطار",
    "لا اريد ذلك",
  ];

  test("every token surface is a word from the original input (AR)", () => {
    for (const s of sentences) {
      const { tokens } = tokenizeAr(s);
      const inputSet = new Set(inputWords(s));
      for (const t of tokens) {
        for (const surfWord of t.surface.split(" ")) {
          expect(inputSet.has(surfWord)).toBe(true);
        }
      }
    }
  });

  test("detokenize() output only contains words from original input (AR)", () => {
    for (const s of sentences) {
      const { tokens } = tokenizeAr(s);
      const recovered = detokenize(tokens);
      const inputSet = new Set(inputWords(s));
      for (const word of recovered.split(" ").filter(Boolean)) {
        expect(inputSet.has(word)).toBe(true);
      }
    }
  });

  test("no token has an empty surface (AR)", () => {
    for (const s of sentences) {
      const { tokens } = tokenizeAr(s);
      for (const t of tokens) {
        expect(t.surface.length).toBeGreaterThan(0);
      }
    }
  });

  test("reconstruct() with offsets gives exact original (AR)", () => {
    const text = "كتب التقرير";
    const { tokens } = tokenizeAr(text);
    const r = reconstruct(text, tokens);
    expect(r).toBe(text);
  });

  test("all token lang values are 'ar' (AR tokenizer)", () => {
    const { tokens } = tokenizeAr("ذهب الى المطار");
    for (const t of tokens) {
      expect(t.lang).toBe("ar");
    }
  });
});

// ── Digest / Gloss / LLMContext ───────────────────────────────────────────────

describe("Detokenizer API: digest / gloss / toLLMContext", () => {
  test("digest() produces space-separated compact strings", () => {
    const { tokens } = tokenizeEn("write a report");
    const d = digest(tokens);
    expect(typeof d).toBe("string");
    expect(d.length).toBeGreaterThan(0);
    // Each segment should be colon-separated
    for (const seg of d.split(" ")) {
      expect(seg).toMatch(/:/);
    }
  });

  test("gloss() wraps each token in brackets", () => {
    const { tokens } = tokenizeEn("write a report");
    const g = gloss(tokens);
    expect(g).toContain("[");
    expect(g).toContain("|");
  });

  test("toLLMContext() returns non-empty string", () => {
    const { tokens } = tokenizeEn("set alarm for tomorrow morning");
    const ctx = toLLMContext(tokens);
    expect(typeof ctx).toBe("string");
    expect(ctx.length).toBeGreaterThan(0);
  });

  test("digest of Arabic tokens contains CONCEPT/REL/STR/LIT", () => {
    const { tokens } = tokenizeAr("ابغي اشوف فيلم");
    const d = digest(tokens);
    expect(d).toMatch(/CONCEPT|STR|REL|LIT/);
  });

  test("gloss() never drops a surface word", () => {
    const text = "play music tomorrow";
    const { tokens } = tokenizeEn(text);
    const g = gloss(tokens);
    for (const word of inputWords(text)) {
      expect(g).toContain(word);
    }
  });
});

// ── detectLang ────────────────────────────────────────────────────────────────

describe("detectLang()", () => {
  test("pure English → en", () => {
    expect(detectLang("write a report for tomorrow")).toBe("en");
    expect(detectLang("set an alarm at 7am")).toBe("en");
  });

  test("pure Arabic → ar", () => {
    expect(detectLang("اريد ان اكتب رسالة")).toBe("ar");
    expect(detectLang("ذهب الى المطار")).toBe("ar");
  });

  test("mixed text → mixed", () => {
    expect(detectLang("اكتب report عن AI")).toBe("mixed");
  });

  test("empty string → en (fallback)", () => {
    expect(detectLang("")).toBe("en");
    expect(detectLang("   ")).toBe("en");
  });
});

// ── Unified tokenize() ────────────────────────────────────────────────────────

describe("tokenize() — unified router", () => {
  test("routes English text to English tokenizer", () => {
    const { tokens } = tokenize("write a report");
    expect(tokens.every((t) => t.lang === "en")).toBe(true);
  });

  test("routes Arabic text to Arabic tokenizer", () => {
    const { tokens } = tokenize("كتب التقرير");
    expect(tokens.every((t) => t.lang === "ar")).toBe(true);
  });

  test("produces non-empty output for any non-trivial text", () => {
    const samples = [
      "hello world",
      "مرحبا بالعالم",
      "AI تقنيات",
      "set alarm 7am",
    ];
    for (const s of samples) {
      expect(tokenize(s).tokens.length).toBeGreaterThan(0);
    }
  });

  test("coverage object always present with valid fields", () => {
    const { coverage } = tokenize("deploy the server");
    expect(typeof coverage.total).toBe("number");
    expect(typeof coverage.litRatio).toBe("number");
    expect(coverage.litRatio).toBeGreaterThanOrEqual(0);
    expect(coverage.litRatio).toBeLessThanOrEqual(1);
  });

  test("surface is never empty in unified tokenize()", () => {
    for (const text of ["write a report", "كتب التقرير", "AI تقنيات"]) {
      for (const t of tokenize(text).tokens) {
        expect(t.surface.length).toBeGreaterThan(0);
      }
    }
  });
});
