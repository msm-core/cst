/**
 * tokenizer/en.ts — English CST tokenizer.
 *
 * Pipeline (no external deps):
 *   1. Normalize — lowercase, NFKC, strip diacritics, contract apostrophes
 *   2. Compound scan — check consecutive bigrams against compounds.json
 *   3. Word tokenize — split on whitespace/punctuation
 *   4. Per-word: function-word lookup → stem lookup → morphology strip → LIT
 *
 * Returns CSTToken[] with surface always preserved.
 */

import type { CSTToken, CSTOutput, TokenType } from "../types.js";
import {
  lookupEnFunction,
  lookupEnCompound,
  lookupEnStem,
  getEnWords,
  getEnMorph,
  type MorphRule,
} from "../vocab/loader.js";

// ── 1. Normalize ─────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'") // smart quotes → straight
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/n't/g, " not") // can't → can not
    .replace(/'s\b/g, "") // John's → John
    .replace(/'re\b/g, " are")
    .replace(/'ve\b/g, " have")
    .replace(/'ll\b/g, " will")
    .replace(/'d\b/g, " would")
    .replace(/'m\b/g, " am")
    .trim();
}

// ── 2. Tokenize words ─────────────────────────────────────────────────────────

const SKIP_WORDS = new Set([
  // Articles, pronouns, auxiliaries
  "a",
  "an",
  "the",
  "is",
  "are",
  "be",
  "been",
  "being",
  "was",
  "were",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "its",
  "our",
  "their",
  "this",
  "that",
  "these",
  "those",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "am",
  "get",
  "got",
  // Common filler / connectors
  "another",
  "there",
  "up",
  "just",
  "still",
  "also",
  "very",
  "so",
  "too",
  "even",
  "both",
  "such",
  "same",
  "some",
  "any",
  "all",
  "each",
  "every",
  "other",
  "own",
  "about",
  "between",
  "within",
  "into",
  "onto",
  // Number words (no semantic content in most contexts)
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "hundred",
  "thousand",
  "million",
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  // Conjunctions, adverbs, fillers that carry no semantic content
  "as",
  "here",
  "yet",
  "down",
  "whats",
  "ca",
  "now",
  "well",
  "back",
  "off",
  "out",
  "over",
  "along",
  "indeed",
  "like",
  "really",
  "quite",
  "rather",
  "anyway",
  "though",
  "although",
  "whereas",
  "unless",
  "meanwhile",
  "therefore",
  "hence",
  "thus",
  "already",
  "else",
  "thus",
  "hence",
]);

function splitWords(
  text: string,
): Array<{ word: string; offset: [number, number] }> {
  const results: Array<{ word: string; offset: [number, number] }> = [];
  // Split on whitespace and punctuation, preserving offsets
  const re = /[^\s.,!?;:()\[\]{}"'—–…]+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const word = match[0];
    // Skip pure numbers, dollar/currency amounts, and single chars
    if (/^\$?\d[\d,._]*%?$/.test(word) || word.length === 1) continue;
    results.push({ word, offset: [match.index, match.index + word.length] });
  }
  return results;
}

// ── 3. Morphology — strip suffix/prefix, try stem lookup ─────────────────────

interface StripResult {
  stem: string;
  role: string;
  gloss: string;
}

let _suffixes: MorphRule[] | null = null;
let _prefixes: MorphRule[] | null = null;

function getMorphRules(): { suffixes: MorphRule[]; prefixes: MorphRule[] } {
  if (!_suffixes || !_prefixes) {
    const m = getEnMorph();
    _suffixes = m.suffixes;
    _prefixes = m.prefixes;
  }
  return { suffixes: _suffixes!, prefixes: _prefixes! };
}

function stripMorphology(lower: string): StripResult | null {
  const { suffixes, prefixes } = getMorphRules();

  // Try prefix first (un-, re-, dis-, etc.)
  for (const rule of prefixes) {
    const pre = rule.prefix!;
    if (lower.startsWith(pre) && lower.length > pre.length + 2) {
      const stem = lower.slice(pre.length);
      const entry = lookupEnStem(stem);
      if (entry) return { stem, role: rule.role, gloss: rule.gloss };
    }
  }

  // Try suffixes (longest match wins — array is ordered longest-first)
  for (const rule of suffixes) {
    const suf = rule.suffix!;
    // Minimum stem length = 2 chars after stripping
    if (lower.endsWith(suf) && lower.length > suf.length + 2) {
      const stem = lower.slice(0, lower.length - suf.length);
      // Try the bare stem, then the silent-e restored form ("writ" → "write").
      // Report whichever actually matched (the old ternary always returned the
      // bare stem, so silent-e words got the wrong stem).
      const direct = lookupEnStem(stem);
      const withE = direct ? null : lookupEnStem(stem + "e");
      if (direct || withE) {
        return {
          stem: direct ? stem : stem + "e",
          role: rule.role,
          gloss: rule.gloss,
        };
      }
    }
  }

  return null;
}

// ── 4. Build a single token ───────────────────────────────────────────────────

function makeToken(
  type: TokenType,
  surface: string,
  offset: [number, number],
  opts: {
    field?: string;
    role?: string;
    relation?: string;
    structure?: string;
    gloss?: string;
    confidence?: number;
  } = {},
): CSTToken {
  const { field, role, relation, structure, gloss, confidence = 1.0 } = opts;

  // Build compact string
  let compact: string;
  if (type === "ROOT") {
    compact = `ROOT:${field}`;
  } else if (type === "ROLE") {
    compact = `ROLE:${role}`;
  } else if (type === "REL") {
    compact = `REL:${relation}`;
  } else if (type === "STR") {
    compact = `STR:${structure}`;
  } else {
    compact = `LIT:${surface}`;
  }

  return {
    type,
    field,
    role,
    relation,
    structure,
    surface,
    gloss,
    compact,
    lang: "en",
    offset,
    confidence,
  };
}

// ── 5. Main tokenize function ─────────────────────────────────────────────────

export function tokenizeEn(text: string): CSTOutput {
  const normalized = normalize(text);
  const wordEntries = splitWords(normalized);
  const tokens: CSTToken[] = [];

  // Detect question mark before word split strips it
  if (text.includes("?")) {
    const qIdx = text.indexOf("?");
    tokens.push(
      makeToken("STR", "?", [qIdx, qIdx + 1], {
        structure: "question",
        confidence: 1.0,
      }),
    );
  }

  let i = 0;
  while (i < wordEntries.length) {
    const { word, offset } = wordEntries[i];
    const lower = word.toLowerCase();

    // ── Function word check (STR / REL) — before skip, so was/were/so etc. emit tokens ──
    const funcEntry = lookupEnFunction(lower);
    if (funcEntry) {
      tokens.push(
        makeToken(funcEntry.type, word, offset, {
          structure: funcEntry.structure,
          relation: funcEntry.relation,
          gloss: funcEntry.gloss,
          confidence: 1.0,
        }),
      );
      i++;
      continue;
    }

    // Skip very short noise and stop-list words
    if (word.length <= 1 || SKIP_WORDS.has(lower)) {
      i++;
      continue;
    }

    // ── Bigram compound check ─────────────────────────────────────────────
    if (i + 1 < wordEntries.length) {
      const next = wordEntries[i + 1];
      const bigram = lower + " " + next.word.toLowerCase();
      const compound = lookupEnCompound(bigram);
      if (compound && compound.field) {
        const spanOffset: [number, number] = [offset[0], next.offset[1]];
        const surface = word + " " + next.word;
        tokens.push(
          makeToken("ROOT", surface, spanOffset, {
            field: compound.field,
            gloss: compound.gloss,
            confidence: 0.95,
          }),
        );
        i += 2;
        continue;
      }
    }

    // ── words.json lookup (surface forms — step 5 before morphology) ─────
    const wordEntry = getEnWords()[lower];
    if (wordEntry) {
      const field = wordEntry.level2 ?? wordEntry.field;
      tokens.push(
        makeToken("ROOT", word, offset, {
          field,
          gloss: wordEntry.gloss,
          confidence: 0.95,
        }),
      );
      i++;
      continue;
    }

    // ── Direct stem lookup ────────────────────────────────────────────────
    const stemEntry = lookupEnStem(lower);
    if (stemEntry) {
      // Also check morphological role (e.g. -er → agent for "teacher")
      const stripped = stripMorphology(lower);
      const field = stemEntry.level2 ?? stemEntry.field;
      // Emit ROOT first, then separate ROLE if morphological pattern detected
      tokens.push(
        makeToken("ROOT", word, offset, {
          field,
          gloss: stemEntry.gloss,
          confidence: 0.9,
        }),
      );
      if (stripped?.role) {
        tokens.push(
          makeToken("ROLE", word, offset, {
            role: stripped.role,
            confidence: 0.9,
          }),
        );
      }
      i++;
      continue;
    }

    // ── Morphological stripping ───────────────────────────────────────────
    const stripped = stripMorphology(lower);
    if (stripped) {
      const reEntry = lookupEnStem(stripped.stem);
      if (reEntry) {
        const field = reEntry.level2 ?? reEntry.field;
        // Emit ROOT + ROLE as separate tokens
        tokens.push(
          makeToken("ROOT", word, offset, {
            field,
            gloss: reEntry.gloss,
            confidence: 0.8,
          }),
        );
        tokens.push(
          makeToken("ROLE", word, offset, {
            role: stripped.role,
            confidence: 0.8,
          }),
        );
        i++;
        continue;
      }
    }

    // ── LIT fallback ──────────────────────────────────────────────────────
    tokens.push(makeToken("LIT", word, offset, { confidence: 0.0 }));
    i++;
  }

  return { tokens, coverage: computeCoverage(tokens) };
}

// ── Coverage ──────────────────────────────────────────────────────────────────

function computeCoverage(tokens: CSTToken[]) {
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
