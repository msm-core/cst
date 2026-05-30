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
  "a",
  "an",
  "the",
  "is",
  "are",
  "be",
  "been",
  "being",
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
  "do",
  "does",
  "am",
  "get",
  "got",
  "got",
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
    // Skip pure numbers (for now, surface preserved as LIT anyway)
    if (/^\d+$/.test(word)) {
      results.push({ word, offset: [match.index, match.index + word.length] });
      continue;
    }
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
      // Try stem, stem+e (for silent-e drop: "writ" → "write")
      const entry = lookupEnStem(stem) ?? lookupEnStem(stem + "e");
      if (entry)
        return {
          stem: entry ? stem : stem + "e",
          role: rule.role,
          gloss: rule.gloss,
        };
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
  if (type === "CONCEPT") {
    compact = role ? `CONCEPT:${field}:${role}` : `CONCEPT:${field}`;
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

    // Skip very short noise and stop-list words (but keep surface as LIT if needed)
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
          makeToken("CONCEPT", surface, spanOffset, {
            field: compound.field,
            gloss: compound.gloss,
            confidence: 0.95,
          }),
        );
        i += 2;
        continue;
      }
    }

    // ── Function word check (STR / REL) ───────────────────────────────────
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

    // ── Direct stem lookup ────────────────────────────────────────────────
    const stemEntry = lookupEnStem(lower);
    if (stemEntry) {
      // Also check morphological role (e.g. -er → agent for "teacher")
      const stripped = stripMorphology(lower);
      tokens.push(
        makeToken("CONCEPT", word, offset, {
          field: stemEntry.level2 ?? stemEntry.field,
          role: stripped?.role,
          gloss: stemEntry.gloss,
          confidence: 0.9,
        }),
      );
      i++;
      continue;
    }

    // ── Morphological stripping ───────────────────────────────────────────
    const stripped = stripMorphology(lower);
    if (stripped) {
      const reEntry = lookupEnStem(stripped.stem);
      if (reEntry) {
        tokens.push(
          makeToken("CONCEPT", word, offset, {
            field: reEntry.level2 ?? reEntry.field,
            role: stripped.role,
            gloss: reEntry.gloss,
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
  const concept = tokens.filter((t) => t.type === "CONCEPT").length;
  const rel = tokens.filter((t) => t.type === "REL").length;
  const str = tokens.filter((t) => t.type === "STR").length;
  const lit = tokens.filter((t) => t.type === "LIT").length;
  return {
    total,
    concept,
    rel,
    str,
    lit,
    litRatio: total > 0 ? lit / total : 0,
  };
}
