/**
 * tokenizer/pipeline.ts — Language detection and unified tokenizer entry point.
 *
 * `detectLang(text)` — classify text as "ar" | "en" | "mixed"
 *   - "ar"    : ≥ 50 % of word characters are Arabic
 *   - "en"    : < 15 % Arabic characters
 *   - "mixed" : 15–49 % Arabic
 *
 * `tokenize(text)` — detect language and route to the right tokenizer.
 *   - "ar"    → tokenizeAr
 *   - "en"    → tokenizeEn
 *   - "mixed" → split sentences/clauses by script, tokenize each half,
 *               concatenate token arrays (offsets are from original string)
 */

import type { CSTOutput } from "../types.js";
import { tokenizeEn } from "./en.js";
import { tokenizeAr } from "./ar.js";

// Arabic Unicode block: U+0600–U+06FF (covers all Arabic letters, extended Arabic, etc.)
const ARABIC_RE = /[\u0600-\u06FF]/g;
const WORD_CHAR_RE = /\S/g;

/** Classify the script dominance of `text`. */
export function detectLang(text: string): "ar" | "en" | "mixed" {
  if (!text.trim()) return "en";
  const wordChars = text.match(WORD_CHAR_RE)?.length ?? 0;
  if (wordChars === 0) return "en";
  const arabicChars = text.match(ARABIC_RE)?.length ?? 0;
  const ratio = arabicChars / wordChars;
  if (ratio >= 0.5) return "ar";
  if (ratio < 0.15) return "en";
  return "mixed";
}

/**
 * Tokenize `text` with automatic language detection.
 *
 * For "mixed" text the string is split into Arabic and non-Arabic runs.
 * Each run is tokenized with its own tokenizer. Token offsets remain
 * relative to the original string.
 */
export function tokenize(text: string): CSTOutput {
  const lang = detectLang(text);

  if (lang === "ar") return tokenizeAr(text);
  if (lang === "en") return tokenizeEn(text);

  // ── Mixed: split into runs by script ────────────────────────────────────
  // A run is a maximal sequence of either Arabic or Latin/other characters
  // (ignoring whitespace and punctuation, which belong to both sides).
  const runs = splitMixedRuns(text);
  const allTokens: CSTOutput["tokens"] = [];

  for (const { slice, offset, lang: runLang } of runs) {
    const result = runLang === "ar" ? tokenizeAr(slice) : tokenizeEn(slice);
    // Shift token offsets to be relative to the full original string
    for (const tok of result.tokens) {
      allTokens.push({
        ...tok,
        offset: [tok.offset[0] + offset, tok.offset[1] + offset],
      });
    }
  }

  return { tokens: allTokens, coverage: computeCoverage(allTokens) };
}

// ── Mixed-run splitter ────────────────────────────────────────────────────────

interface Run {
  slice: string;
  offset: number;
  lang: "ar" | "en";
}

const ARABIC_WORD_RE = /[\u0600-\u06FF]/;

function splitMixedRuns(text: string): Run[] {
  const runs: Run[] = [];
  // Split on sentence-like boundaries first (. ! ? ، ؟ newline)
  const sentenceRe = /[^.!?\n،؟;]+[.!?\n،؟;]*/g;
  let m: RegExpExecArray | null;
  while ((m = sentenceRe.exec(text)) !== null) {
    const slice = m[0];
    const offset = m.index;
    const arChars = slice.match(ARABIC_RE)?.length ?? 0;
    const wChars = slice.match(WORD_CHAR_RE)?.length ?? 1;
    const runLang: "ar" | "en" = arChars / wChars >= 0.3 ? "ar" : "en";
    // Merge with previous run if same language
    const last = runs[runs.length - 1];
    if (
      last &&
      last.lang === runLang &&
      last.offset + last.slice.length === offset
    ) {
      last.slice += slice;
    } else {
      runs.push({ slice, offset, lang: runLang });
    }
  }
  // Fallback: whole text as one run if sentence split failed
  if (runs.length === 0) {
    runs.push({
      slice: text,
      offset: 0,
      lang: ARABIC_WORD_RE.test(text) ? "ar" : "en",
    });
  }
  return runs;
}

// ── Coverage helper ───────────────────────────────────────────────────────────

function computeCoverage(tokens: CSTOutput["tokens"]): CSTOutput["coverage"] {
  const total = tokens.length;
  const root = tokens.filter((t) => t.type === "ROOT").length;
  const role = tokens.filter((t) => t.type === "ROLE").length;
  const rel = tokens.filter((t) => t.type === "REL").length;
  const str = tokens.filter((t) => t.type === "STR").length;
  const lit = tokens.filter((t) => t.type === "LIT").length;
  return {
    total,
    root,
    role,
    rel,
    str,
    lit,
    litRatio: total > 0 ? lit / total : 0,
  };
}
