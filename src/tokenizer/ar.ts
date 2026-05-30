/**
 * tokenizer/ar.ts — Arabic CST tokenizer.
 *
 * Pipeline:
 *   1. Normalize   — strip diacritics, unify hamza/alef forms, remove tatweel
 *   2. Compound scan — check consecutive bigrams against ar/compounds.json
 *   3. Word split  — split on whitespace + punctuation
 *   4. Per-word:
 *      a. Function-word skip (set)
 *      b. Structural map → STR token (NEG, MODAL, QUERY etc.)
 *      c. Relation map   → REL token
 *      d. Direct vocab lookup (roots.json, then direct.json)
 *      e. Clitic segmentation → retry root/direct lookup
 *      f. Augmented-verb stripping → retry
 *      g. Morphological role detection on the matched stem
 *      h. LIT fallback
 *
 * Shares the CSTToken interface with en.ts — same field names, same compact format.
 */

import type { CSTToken, CSTOutput, TokenType } from "../types.js";
import {
  getArRoots,
  getArDirect,
  getArCompounds,
  getArStructural,
  getArRelations,
  getArFunctionWords,
} from "../vocab/loader.js";

// ── 1. Normalise ─────────────────────────────────────────────────────────────

const DIACRITIC_RE = /[\u064B-\u065F\u0670]/g;
const TATWEEL_RE = /\u0640/g;

function normalizeAr(text: string): string {
  let s = text.replace(DIACRITIC_RE, "").replace(TATWEEL_RE, "");
  // Alef variants → bare alef ا
  s = s.replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627");
  // ى → ي
  s = s.replace(/\u0649/g, "\u064A");
  // ؤ → و
  s = s.replace(/\u0624/g, "\u0648");
  // ة → ه (tā-marbūṭah normalisation in full text)
  s = s.replace(/\u0629/g, "\u0647");
  return s;
}

// ── 2. Clitic segmentation ────────────────────────────────────────────────────
// Order is strict — see nemo AGENTS.md rule 7.

const CONJUNCTIVE = ["\u0648", "\u0641"]; // و ف
const PREP_PREFIX = ["\u0628", "\u0644", "\u0643"]; // ب ل ك
const DEF_ARTICLE = "\u0627\u0644"; // ال
const OBJ_SUFFIXES = [
  "\u0647\u0645",
  "\u0647\u0646",
  "\u0643\u0645",
  "\u0647\u0627",
  "\u0647",
  "\u0643",
  "\u0646\u0627",
  "\u064A",
];
const TA_MARBUTA = "\u0629";
const HA = "\u0647";

function segment(word: string): string {
  let s = word;
  // Conjunction prefix (و/ف)
  for (const p of CONJUNCTIVE) {
    if (s.startsWith(p) && s.length > p.length + 2) {
      s = s.slice(p.length);
      break;
    }
  }
  // لل contraction → strip 2
  if (s.startsWith("\u0644\u0644") && s.length > 4) {
    s = s.slice(2);
  } else {
    for (const p of PREP_PREFIX) {
      if (s.startsWith(p) && s.length > p.length + 2) {
        s = s.slice(p.length);
        break;
      }
    }
  }
  // Definite article ال
  if (s.startsWith(DEF_ARTICLE) && s.length > DEF_ARTICLE.length + 1) {
    s = s.slice(DEF_ARTICLE.length);
  }
  // Object/possessive suffix (strip one)
  for (const suf of OBJ_SUFFIXES) {
    if (s.endsWith(suf) && s.length >= suf.length + 2) {
      s = s.slice(0, -suf.length);
      break;
    }
  }
  // ة → ه (tā-marbūṭah normalisation)
  if (s.endsWith(TA_MARBUTA)) s = s.slice(0, -1) + HA;
  // Trailing accusative alef (after diacritic removal)
  if (s.endsWith("\u0627") && s.length > 3) s = s.slice(0, -1);
  return s;
}

/** Try stripping augmented-verb prefixes (Form X / V / I-1st-person). */
function stripVerbAug(stem: string): string {
  const IST = "\u0627\u0633\u062A"; // است Form X
  const TA_ = "\u062A"; // ت   Form V
  const ALF = "\u0627"; // ا   1st-person
  if (stem.startsWith(IST) && stem.length > 5) return stem.slice(3);
  if (stem.startsWith(TA_) && stem.length >= 5) return stem.slice(1);
  if (stem.startsWith(ALF) && stem.length >= 4) return stem.slice(1);
  return stem;
}

// ── 3. Arabic morphological role ──────────────────────────────────────────────

const ALEF = "\u0627";
const MIM = "\u0645";
const TA = "\u062A";
const WAW = "\u0648";
const YEH = "\u064A";
const HAR = "\u0647";

function detectRoleAr(stem: string): string | undefined {
  const n = stem.length;
  if (n < 3) return undefined;
  if (n === 4 && stem[1] === ALEF) return "agent";
  if (n === 5 && stem[1] === ALEF && stem[4] === HAR) return "agent";
  if (n === 5 && stem[0] === MIM && stem[3] === WAW) return "patient";
  if (n === 6 && stem[0] === MIM && stem[3] === WAW && stem[5] === HAR)
    return "patient";
  if (n === 5 && stem[0] === TA && stem[3] === YEH) return "process";
  if (
    (n === 5 || n === 6) &&
    stem[0] === MIM &&
    stem[n - 1] === HAR &&
    stem[3] !== WAW
  )
    return "place";
  return undefined;
}

// ── 4. Cached normalized lookups ─────────────────────────────────────────────

// We normalize all vocab keys at load time so lookup is O(1)
let _rootsNorm: Record<string, string> | null = null;
let _directNorm: Record<string, string> | null = null;
let _structNorm: Record<string, string> | null = null;
let _relNorm: Record<string, string> | null = null;
let _funcNorm: Set<string> | null = null;

function getRootsNorm(): Record<string, string> {
  if (!_rootsNorm) {
    _rootsNorm = {};
    for (const [k, v] of Object.entries(getArRoots())) {
      const nk = normalizeAr(k);
      if (!_rootsNorm[nk]) _rootsNorm[nk] = v; // first entry wins (prefer already-normalized keys)
    }
  }
  return _rootsNorm;
}

function getDirectNorm(): Record<string, string> {
  if (!_directNorm) {
    _directNorm = {};
    for (const [k, v] of Object.entries(getArDirect())) {
      _directNorm[normalizeAr(k)] = v;
    }
  }
  return _directNorm;
}

function getStructNorm(): Record<string, string> {
  if (!_structNorm) {
    _structNorm = {};
    for (const [k, v] of Object.entries(getArStructural())) {
      _structNorm[normalizeAr(k)] = v;
    }
  }
  return _structNorm;
}

function getRelNorm(): Record<string, string> {
  if (!_relNorm) {
    _relNorm = {};
    for (const [k, v] of Object.entries(getArRelations())) {
      _relNorm[normalizeAr(k)] = v;
    }
  }
  return _relNorm;
}

function getFuncNorm(): Set<string> {
  if (!_funcNorm) {
    _funcNorm = new Set();
    for (const w of getArFunctionWords()) {
      _funcNorm.add(normalizeAr(w));
    }
  }
  return _funcNorm;
}

// ── 5. Vocab lookup (root → direct → clitic strip → aug strip) ───────────────

function lookupField(normStem: string): string | null {
  const roots = getRootsNorm();
  const direct = getDirectNorm();
  // Direct root match
  if (roots[normStem]) return roots[normStem];
  // Direct field match
  if (direct[normStem]) return direct[normStem];
  // Try without trailing ه (ة normalised to ه already)
  if (normStem.endsWith(HA)) {
    const base = normStem.slice(0, -1);
    if (roots[base]) return roots[base];
    if (direct[base]) return direct[base];
  }
  return null;
}

// ── 6. Build token helpers ────────────────────────────────────────────────────

function makeArToken(
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
  let compact: string;
  if (type === "ROOT") compact = `ROOT:${field}`;
  else if (type === "ROLE") compact = `ROLE:${role}`;
  else if (type === "REL") compact = `REL:${relation}`;
  else if (type === "STR") compact = `STR:${structure}`;
  else compact = `LIT:${surface}`;

  return {
    type,
    field,
    role,
    relation,
    structure,
    surface,
    gloss,
    compact,
    lang: "ar",
    offset,
    confidence,
  };
}

// ── 7. Split words ────────────────────────────────────────────────────────────

function splitArWords(
  text: string,
): Array<{ word: string; offset: [number, number] }> {
  const results: Array<{ word: string; offset: [number, number] }> = [];
  const re = /[^\s.,!?;:()\[\]{}"'،؟؛—–…]+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    results.push({
      word: match[0],
      offset: [match.index, match.index + match[0].length],
    });
  }
  return results;
}

// ── 8. Main tokenizer ─────────────────────────────────────────────────────────

export function tokenizeAr(text: string): CSTOutput {
  const normText = normalizeAr(text);
  // Split original text for surfaces, split normalized text for lookup positions
  const wordEntries = splitArWords(text);
  const normWordEntries = splitArWords(normText);
  const tokens: CSTToken[] = [];

  // Detect Arabic question mark before word split strips it
  if (text.includes("\u061F")) {
    const qIdx = text.indexOf("\u061F");
    tokens.push(
      makeArToken("STR", "\u061F", [qIdx, qIdx + 1], {
        structure: "question",
        confidence: 1.0,
      }),
    );
  }

  // Pre-build normalized compound bigrams map
  const compounds = getArCompounds();
  const compoundsNorm: Record<string, string> = {};
  for (const [k, v] of Object.entries(compounds)) {
    compoundsNorm[normalizeAr(k)] = v;
  }

  let i = 0;
  while (i < wordEntries.length) {
    const { word, offset } = wordEntries[i];
    const normWord = normWordEntries[i]?.word ?? normalizeAr(word);

    // ── Bigram compound check ─────────────────────────────────────────────
    if (i + 1 < wordEntries.length) {
      const next = wordEntries[i + 1];
      const normNext = normWordEntries[i + 1]?.word ?? normalizeAr(next.word);
      const bigram = normWord + " " + normNext;
      if (compoundsNorm[bigram]) {
        const spanOffset: [number, number] = [offset[0], next.offset[1]];
        const surface = word + " " + next.word;
        tokens.push(
          makeArToken("ROOT", surface, spanOffset, {
            field: compoundsNorm[bigram],
            confidence: 0.95,
          }),
        );
        i += 2;
        continue;
      }
    }

    // ── Structural map (STR) ──────────────────────────────────────────────
    // Must come before function-word skip (some STR words are also in func set)
    const structType = getStructNorm()[normWord];
    if (structType) {
      // Map nemo TokenType names to our structure strings
      const structure = nemoTypeToStructure(structType);
      if (structure) {
        tokens.push(
          makeArToken("STR", word, offset, { structure, confidence: 1.0 }),
        );
        i++;
        continue;
      }
      // QUERY types without compound context → emit STR:question
      if (structType.endsWith("_Q") || structType === "QUERY") {
        tokens.push(
          makeArToken("STR", word, offset, {
            structure:
              structType === "QUERY"
                ? "question"
                : structType.replace("_Q", "").toLowerCase() + "_question",
            confidence: 1.0,
          }),
        );
        i++;
        continue;
      }
    }

    // ── Relation map (REL) ────────────────────────────────────────────────
    // Must come before function-word skip (في/على/من/الى are in func set)
    const relEntry = getRelNorm()[normWord];
    if (relEntry) {
      const relation = relEntry.replace("REL:", "");
      tokens.push(
        makeArToken("REL", word, offset, { relation, confidence: 1.0 }),
      );
      i++;
      continue;
    }

    // ── Function word skip ────────────────────────────────────────────────
    if (getFuncNorm().has(normWord)) {
      i++;
      continue;
    }

    // ── سـ future prefix ──────────────────────────────────────────────────
    // Detect سـ (sin) future prefix: سيفعل / ستفعل etc.
    // Strip leading س only when the remainder resolves to a known field (avoids سيارة false positive).
    const SIN = "\u0633"; // س
    if (normWord.startsWith(SIN) && normWord.length > 3) {
      const remainder = normWord.slice(1);
      const futureField =
        lookupField(remainder) ??
        lookupField(segment(remainder)) ??
        lookupField(stripVerbAug(segment(remainder)));
      if (futureField) {
        tokens.push(
          makeArToken("STR", word, offset, {
            structure: "future",
            confidence: 0.9,
          }),
        );
        tokens.push(
          makeArToken("ROOT", word, offset, {
            field: futureField,
            confidence: 0.8,
          }),
        );
        i++;
        continue;
      }
    }

    // ── Root / direct lookup ──────────────────────────────────────────────
    let field = lookupField(normWord);
    let matchStem = normWord;
    let confidence = 0.9;

    // Try clitic segmentation
    if (!field) {
      const seg = segment(normWord);
      if (seg !== normWord) {
        field = lookupField(seg);
        matchStem = seg;
        confidence = 0.8;
      }
    }

    // Try augmented-verb stripping
    if (!field) {
      const aug = stripVerbAug(matchStem);
      if (aug !== matchStem) {
        field = lookupField(aug);
        matchStem = aug;
        confidence = 0.7;
      }
    }

    if (field) {
      const role = detectRoleAr(matchStem);
      // Emit ROOT first, then a separate ROLE token if morphological pattern detected
      // This is the Arabic algebra: roots × patterns = coverage without enumerating all combos
      tokens.push(
        makeArToken("ROOT", word, offset, {
          field,
          gloss: undefined,
          confidence,
        }),
      );
      if (role)
        tokens.push(makeArToken("ROLE", word, offset, { role, confidence }));
      i++;
      continue;
    }

    // ── LIT fallback ──────────────────────────────────────────────────────
    tokens.push(makeArToken("LIT", word, offset, { confidence: 0.0 }));
    i++;
  }

  return { tokens, coverage: computeCoverageAr(tokens) };
}

// ── Structural type mapping ───────────────────────────────────────────────────

function nemoTypeToStructure(nemoType: string): string | null {
  const map: Record<string, string> = {
    NEG: "negation",
    MODAL: "modal",
    COND: "conditional",
    CAUSE: "cause",
    FUTURE: "future",
    PAST: "past",
  };
  return map[nemoType] ?? null;
}

// ── Coverage ──────────────────────────────────────────────────────────────────

function computeCoverageAr(tokens: CSTToken[]) {
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
