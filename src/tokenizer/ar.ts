/**
 * tokenizer/ar.ts — Arabic CST tokenizer.
 *
 * Pipeline (BIBLE §9, §8.2 lookup ladder):
 *   1. Normalize   — strip diacritics, unify alef/hamza forms, remove tatweel
 *   2. Compound scan — check consecutive bigrams against ar/compounds.json
 *   3. Word split  — split on whitespace + punctuation
 *   4. Per-word:
 *      a. Structural map → STR token  (must precede function-word skip)
 *      b. Relation map   → REL token  (must precede function-word skip)
 *      c. Function-word skip
 *      d. words.json lookup  (step 5 — surface forms, before segmentation)
 *      e. stems.json lookup  (step 6 — root stems, before segmentation)
 *      f. Clitic segmentation → retry steps 5–6
 *      g. Augmented-verb stripping → retry steps 5–6
 *      h. Morphological role detection on the matched stem
 *      i. LIT fallback
 *
 * Shares the CSTToken interface with en.ts — same compact format.
 */

import type { CSTToken, CSTOutput, TokenType } from "../types.js";
import {
  getArStems,
  getArWords,
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

// ── 3. Arabic morphological role ─────────────────────────────────────────────
//
// Full §5.1 tier system (Tier 1 → 4, most-specific first).
// Input: normalized, clitic-stripped, aug-stripped stem (diacritics removed,
//        ة→ه, ى→ي, alef variants→ا).
// Patterns are tested in length order so longer (more specific) wins first.
//
// C = any Arabic letter [\u0621-\u064A] in the root consonant position.
// Structural letters in fixed positions: ا و ي ه ت ن (from wazn).

// Fixed wazn characters (after normalization)
const ALEF = "\u0627"; // ا
const WAW = "\u0648"; // و
const YEH = "\u064A"; // ي
// HA = "\u0647" already declared in §2 clitic section above
const MIM = "\u0645"; // م
const NUN = "\u0646"; // ن
const TA2 = "\u062A"; // ت
const IST = "\u0627\u0633\u062A"; // است (Form X prefix)

// Any Arabic letter (C in wazn notation)
const AR = /[\u0621-\u064A]/;

function detectRoleAr(stem: string): string | undefined {
  const n = stem.length;
  if (n < 3) return undefined;

  // ─── Tier 1: 7-char ─────────────────────────────────────────────────────
  // استفعال: است + C₁C₂ + ا + C₃  (Form X masdar, 7 chars)
  if (n === 7 && stem.startsWith(IST) && stem[5] === ALEF) return "seeker";

  // ─── Tier 2: 6-char ─────────────────────────────────────────────────────
  if (n === 6) {
    // مفاعلة: م + C₁ + ا + C₂ + C₃ + ه  (Form III masdar → process)
    if (stem[0] === MIM && stem[2] === ALEF && stem[5] === HA) return "process";
    // تفعيل: ت + C₁ + C₂ + ي + C₃         (Form II masdar → intensifier)
    if (stem[0] === TA2 && stem[3] === YEH) return "intensifier";
    // مفعوله: م + C₁ + C₂ + و + C₃ + ه    (مفعول + fem suffix → patient)
    if (stem[0] === MIM && stem[3] === WAW && stem[5] === HA) return "patient";
    // استفعل: است + C₁ + C₂ + C₃            (Form X verb stem, 6 chars → seeker)
    if (stem.startsWith(IST)) return "seeker";
    // مفعلة: م + C₁ + C₂ + C₃ + ه, C₃ ≠ و  (اسم مكان/زمان → place)
    if (stem[0] === MIM && stem[5] === HA && stem[3] !== WAW) return "place";
  }

  // ─── Tier 3: 5-char (reflexive BEFORE result to handle انتقل correctly) ─
  if (n === 5) {
    // افتعل: ا + C₁ + ت + C₂ + C₃          (Form VIII → reflexive)
    if (stem[0] === ALEF && stem[2] === TA2) return "reflexive";
    // انفعل: ا + ن + C₁ + C₂ + C₃          (Form VII → result)
    if (stem[0] === ALEF && stem[1] === NUN) return "result";
    // تفاعل: ت + C₁ + ا + C₂ + C₃          (Form VI → mutual)
    if (stem[0] === TA2 && stem[2] === ALEF) return "mutual";
    // مفعول: م + C₁ + C₂ + و + C₃          (اسم مفعول → patient)
    if (stem[0] === MIM && stem[3] === WAW) return "patient";
    // مفعال: م + C₁ + C₂ + ا + C₃          (اسم آلة → instrument)
    if (stem[0] === MIM && stem[3] === ALEF) return "instrument";
    // فاعول: C₁ + ا + C₂ + و + C₃          (اسم آلة, e.g. حاسوب → instrument)
    if (stem[1] === ALEF && stem[3] === WAW) return "instrument";
    // فاعله: C₁ + ا + C₂ + C₃ + ه          (fem. active participle → agent)
    if (stem[1] === ALEF && stem[4] === HA) return "agent";
    // مفعِل (5, no structural vowel after م): م + C{4}  → place
    if (stem[0] === MIM) return "place";
  }

  // ─── State: فَعلان / فُعلان — ends با + ن, length ≥ 5 ─────────────────
  if (n >= 5 && stem[n - 2] === ALEF && stem[n - 1] === NUN) return "state";

  // ─── Tier 4: 4-char ─────────────────────────────────────────────────────
  if (n === 4) {
    // فاعل: C₁ + ا + C₂ + C₃  (active participle → agent)
    if (stem[1] === ALEF) return "agent";
    // فعيل: C₁ + C₂ + ي + C₃  (quality/passive adj → patient)
    if (stem[2] === YEH) return "patient";
    // فعال: C₁ + C₂ + ا + C₃  (verbal noun → instance)
    if (stem[2] === ALEF) return "instance";
    // مفعل: م + C₁ + C₂ + C₃  (اسم مكان, 4-char → place)
    if (stem[0] === MIM) return "place";
    // افعل: ا + C₁ + C₂ + C₃  (elative → comparative)
    if (stem[0] === ALEF) return "comparative";
  }

  return undefined;
}

// ── 3b. Root reduction (derived form → triliteral root) ──────────────────────
//
// Most Arabic LIT misses are derived noun/verb forms whose ROOT is already in
// the vocabulary — the lookup just never reduced them (مقتل place-noun of قتل,
// الزراعة masdar of زرع, العلاقات plural of علق). These helpers propose candidate
// roots; the caller accepts a candidate ONLY if it resolves to a known stem, so
// an over-eager reduction can never invent a wrong field.

/** Remove the first interior long vowel (ا/و/ي) — e.g. فعال→فعل, مفعول→مفعل. */
function removeMedialVowel(s: string): string {
  for (let i = 1; i < s.length - 1; i++) {
    if (s[i] === ALEF || s[i] === WAW || s[i] === YEH) {
      return s.slice(0, i) + s.slice(i + 1);
    }
  }
  return s;
}

/**
 * Candidate triliteral roots for a derived form. Strips common noun/plural/
 * nisba/verb affixes and long-vowel infixes. Returns plausible roots (len 2–4)
 * other than the input itself; the caller validates each against the vocab.
 */
function deriveRootCandidates(stem: string): string[] {
  const bases = new Set<string>([stem]);
  const n = stem.length;
  if (stem.endsWith(HA) && n > 3) bases.add(stem.slice(0, -1)); // ة/ه feminine
  if (stem.endsWith(ALEF + TA2) && n > 4) bases.add(stem.slice(0, -2)); // ات plural
  if ((stem.endsWith(WAW + NUN) || stem.endsWith(YEH + NUN)) && n > 4)
    bases.add(stem.slice(0, -2)); // ون/ين sound plural
  if ((stem.endsWith(YEH + HA) || stem.endsWith(YEH + TA2)) && n > 4)
    bases.add(stem.slice(0, -2)); // ية nisba
  if (stem.endsWith(TA2) && n > 3) bases.add(stem.slice(0, -1)); // verb ت suffix
  if (stem.endsWith(YEH) && n > 3) bases.add(stem.slice(0, -1)); // nisba ي

  const out = new Set<string>();
  for (const b of bases) {
    out.add(b);
    out.add(removeMedialVowel(b)); // فعال/فعيل → فعل
    if (b[0] === MIM && b.length >= 4) {
      const noM = b.slice(1); // مفعل/مفعول → place/instrument/participle
      out.add(noM);
      out.add(removeMedialVowel(noM));
    }
    if (b[0] === ALEF && b.length >= 4) out.add(b.slice(1)); // أفعل Form IV / elative
  }
  return [...out].filter((r) => r.length >= 2 && r.length <= 4 && r !== stem);
}

// ── 4. Cached normalized lookups ─────────────────────────────────────────────

// We normalize all vocab keys at load time so lookup is O(1)
type ArVocabEntry = string | { field: string; gloss?: string };

let _stemsNorm: Record<string, ArVocabEntry> | null = null;
let _wordsNorm: Record<string, ArVocabEntry> | null = null;
let _structNorm: Record<string, string> | null = null;
let _relNorm: Record<string, string> | null = null;
let _funcNorm: Set<string> | null = null;
let _compoundsNorm: Record<string, string> | null = null;

/**
 * words.json (surface forms) — checked at step 5 (before segmentation).
 * These are irregular forms, loanwords, broken plurals.
 */
function getWordsNorm(): Record<string, ArVocabEntry> {
  if (!_wordsNorm) {
    _wordsNorm = {} as Record<string, ArVocabEntry>;
    for (const [k, v] of Object.entries(getArWords())) {
      _wordsNorm[normalizeAr(k)] = v;
    }
  }
  return _wordsNorm;
}

/**
 * stems.json (root stems) — checked at step 6 (after segmentation).
 * These are canonical Arabic trilateral root stems.
 */
function getStemsNorm(): Record<string, ArVocabEntry> {
  if (!_stemsNorm) {
    _stemsNorm = {} as Record<string, ArVocabEntry>;
    for (const [k, v] of Object.entries(getArStems())) {
      const nk = normalizeAr(k);
      if (!_stemsNorm[nk]) _stemsNorm[nk] = v; // first entry wins
    }
  }
  return _stemsNorm;
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

/** Normalized compound-bigram map. Cached at module level — was previously
 *  rebuilt on every tokenizeAr() call, making the AR path needlessly slow. */
function getCompoundsNorm(): Record<string, string> {
  if (!_compoundsNorm) {
    _compoundsNorm = {};
    for (const [k, v] of Object.entries(getArCompounds())) {
      _compoundsNorm[normalizeAr(k)] = v;
    }
  }
  return _compoundsNorm;
}

// ── 5. Vocab lookup (words → stems, per BIBLE §8.2 steps 5–6) ───────────────────

/**
 * Look up a normalized form against words.json first (step 5), then stems.json (step 6).
 * Called both pre-segmentation (surface lookup) and post-segmentation (stem lookup).
 */
function resolveEntry(entry: ArVocabEntry): { field: string; gloss?: string } {
  if (typeof entry === "string") return { field: entry };
  return { field: entry.field, gloss: entry.gloss };
}

function lookupField(
  normStem: string,
): { field: string; gloss?: string } | null {
  const words = getWordsNorm();
  const stems = getStemsNorm();
  // Step 5: surface/words lookup
  if (words[normStem]) return resolveEntry(words[normStem]);
  // Step 6: stem lookup
  if (stems[normStem]) return resolveEntry(stems[normStem]);
  // Try without trailing ه (ة normalised to ه already)
  if (normStem.endsWith(HA)) {
    const base = normStem.slice(0, -1);
    if (words[base]) return resolveEntry(words[base]);
    if (stems[base]) return resolveEntry(stems[base]);
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
  const re = /[^\s.,!?;:()\[\]{}"'،؟؛—–…\-/]+/g;
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

  // Normalized compound bigrams map (module-cached).
  const compoundsNorm = getCompoundsNorm();

  let i = 0;
  while (i < wordEntries.length) {
    const { word, offset } = wordEntries[i];
    const normWord = normWordEntries[i]?.word ?? normalizeAr(word);

    // Skip pure numbers, single Latin/Arabic letters (list markers, OCR artifacts)
    if (
      /^\d[\d,.]*(st|nd|rd|th)?$/.test(word) ||
      (word.length === 1 && !/[\u0600-\u06FF]/.test(word))
    ) {
      i++;
      continue;
    }

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
    //
    // §9.5 special rule: لم emits STR:past + STR:negation (two tokens)
    //                    لن emits STR:future + STR:negation (two tokens)
    const LAM_M = "\u0644\u0645"; // لم
    const LAM_N = "\u0644\u0646"; // لن
    if (normWord === LAM_M) {
      tokens.push(
        makeArToken("STR", word, offset, {
          structure: "past",
          confidence: 1.0,
        }),
      );
      tokens.push(
        makeArToken("STR", word, offset, {
          structure: "negation",
          confidence: 1.0,
        }),
      );
      i++;
      continue;
    }
    if (normWord === LAM_N) {
      tokens.push(
        makeArToken("STR", word, offset, {
          structure: "future",
          confidence: 1.0,
        }),
      );
      tokens.push(
        makeArToken("STR", word, offset, {
          structure: "negation",
          confidence: 1.0,
        }),
      );
      i++;
      continue;
    }

    // ar/structural.json values are already CST marker names (migrated from nemo types)
    const structure = getStructNorm()[normWord];
    if (structure) {
      tokens.push(
        makeArToken("STR", word, offset, { structure, confidence: 1.0 }),
      );
      i++;
      continue;
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
            field: futureField.field,
            gloss: futureField.gloss,
            confidence: 0.8,
          }),
        );
        i++;
        continue;
      }
    }

    // ── Root / direct lookup ──────────────────────────────────────────────
    let lookup = lookupField(normWord);
    let matchStem = normWord;
    let confidence = 0.9;

    // Light definite-article strip (ال only, before full segment).
    // Full segment() strips object suffixes too, which incorrectly removes the
    // normalised tā-marbūṭah (ة→ه) from feminine nouns like العاصمة→عاصم instead
    // of العاصمة→عاصمه.  Try the bare ال-stripped form first.
    if (
      !lookup &&
      normWord.startsWith(DEF_ARTICLE) &&
      normWord.length > DEF_ARTICLE.length + 1
    ) {
      const noAl = normWord.slice(DEF_ARTICLE.length);
      const lightLookup = lookupField(noAl);
      if (lightLookup) {
        lookup = lightLookup;
        matchStem = noAl;
        confidence = 0.85;
      }
    }

    // Try full clitic segmentation
    if (!lookup) {
      const seg = segment(normWord);
      if (seg !== normWord) {
        lookup = lookupField(seg);
        matchStem = seg;
        confidence = 0.8;
        // After segment, also check structural + relation maps on the segmented stem.
        // Handles conjunction-prefixed function words: وكانت → و + كانت (STR:past).
        if (!lookup) {
          const segStruct = getStructNorm()[seg];
          if (segStruct) {
            tokens.push(
              makeArToken("STR", word, offset, {
                structure: segStruct,
                confidence: 0.8,
              }),
            );
            i++;
            continue;
          }
          const segRelEntry = getRelNorm()[seg];
          if (segRelEntry) {
            tokens.push(
              makeArToken("REL", word, offset, {
                relation: segRelEntry.replace("REL:", ""),
                confidence: 0.8,
              }),
            );
            i++;
            continue;
          }
        }
      }
    }

    // Try augmented-verb stripping
    if (!lookup) {
      const aug = stripVerbAug(matchStem);
      if (aug !== matchStem) {
        lookup = lookupField(aug);
        matchStem = aug;
        confidence = 0.7;
      }
    }

    // The derived surface form drives ROLE detection (مقتل = place-noun of قتل).
    // Root reduction below changes matchStem to the bare root for the FIELD only.
    const roleStem = matchStem;

    // Pattern-based root reduction — reduce a derived noun/verb to its root and
    // retry the field lookup. Accepts ONLY a reduction that hits a known stem,
    // so an over-eager reduction can never invent a field (precision-safe).
    if (!lookup) {
      for (const cand of deriveRootCandidates(matchStem)) {
        const hit = lookupField(cand);
        if (hit) {
          lookup = hit;
          matchStem = cand;
          confidence = 0.6;
          break;
        }
      }
    }

    if (lookup) {
      const { field, gloss } = lookup;
      const role = detectRoleAr(roleStem);
      // Emit ROOT first, then a separate ROLE token if morphological pattern detected
      // This is the Arabic algebra: roots × patterns = coverage without enumerating all combos
      tokens.push(
        makeArToken("ROOT", word, offset, {
          field,
          gloss,
          confidence,
        }),
      );
      if (role)
        tokens.push(makeArToken("ROLE", word, offset, { role, confidence }));
      i++;
      continue;
    }

    // ── LIT fallback ─────────────────────────────────────────────────────
    // Even when the field is unknown, attempt to extract a ROLE from the
    // word's وزن (morphological pattern).  This gives partial signal to
    // downstream HDC encoding — the field is absent but the grammatical
    // function (agent / patient / place / …) is still recoverable.
    tokens.push(makeArToken("LIT", word, offset, { confidence: 0.0 }));
    const litRole = detectRoleAr(matchStem);
    if (litRole)
      tokens.push(
        makeArToken("ROLE", word, offset, { role: litRole, confidence: 0.3 }),
      );
    i++;
  }

  return { tokens, coverage: computeCoverageAr(tokens) };
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
