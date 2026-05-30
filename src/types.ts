/**
 * types.ts — Core CST token interfaces.
 *
 * Every language analyzer (en, ar, ...) MUST produce tokens
 * that conform to CSTToken. No exceptions.
 *
 * Design rules:
 *  - `surface` is NEVER dropped — it is the anchor for detokenization
 *  - `compact` is the single serializable string sent to models
 *  - `field` uses dot notation for hierarchy: "tech.code", or just "tech"
 */

// ── Token Types ───────────────────────────────────────────────────────────────

/**
 * ROOT  — content word mapped to a semantic field (the Arabic algebra root)
 *         compact: "ROOT:write" | "ROOT:tech.code"
 *         Every content word emits exactly one ROOT token.
 *
 * ROLE  — morphological/derivational pattern of the preceding ROOT
 *         compact: "ROLE:agent" | "ROLE:patient" | "ROLE:place"
 *         Only emitted when the morphological form is detectable.
 *         Separate from ROOT so models compose them freely:
 *         ROOT:write × ROLE:agent = كاتب / writer / scribes — without
 *         needing to enumerate all (field × role) combinations as atoms.
 *
 * REL   — relational/function word (preposition, conjunction)
 *         compact: "REL:in" / "REL:causes"
 * STR   — sentence-level structure marker
 *         compact: "STR:question" / "STR:negation" / "STR:modal"
 * LIT   — literal fallback (named entity, unknown word)
 *         compact: "LIT:iPhone" (surface preserved)
 */
export type TokenType = "ROOT" | "ROLE" | "REL" | "STR" | "LIT";

// ── Main token interface ──────────────────────────────────────────────────────

export interface CSTToken {
  // What kind of token
  type: TokenType;

  // Semantic analysis (consumed by HDC / ML)
  field?: string; // "tech.code" | "write" — set on ROOT tokens
  role?: string; // "agent" | "patient" | "place" ... — set on ROLE tokens
  relation?: string; // REL category: "in" | "causes" | "before" ... — set on REL tokens
  structure?: string; // STR marker: "question" | "negation" | "modal" ... — set on STR tokens

  // Surface preservation (NEVER dropped)
  surface: string; // exact original word from input
  gloss?: string; // human-readable meaning: "write, record" — from vocab file

  // Serializable compact form for model consumption
  // ROOT:  "ROOT:write"  |  "ROOT:tech.code"
  // ROLE:  "ROLE:agent"  |  "ROLE:patient"
  // REL:   "REL:in"      |  "REL:causes"
  // STR:   "STR:modal"   |  "STR:negation"
  // LIT:   "LIT:iPhone"  (surface preserved verbatim)
  compact: string;

  // Language and position
  lang: "en" | "ar" | "mixed";
  offset: [number, number]; // [start, end] char offsets in original input string

  // Confidence 0.0–1.0
  confidence: number;
}

// ── Tokenizer output ─────────────────────────────────────────────────────────

export interface CSTOutput {
  tokens: CSTToken[];
  coverage: CoverageSummary;
}

export interface CoverageSummary {
  total: number;
  root: number; // ROOT tokens (content words successfully mapped)
  role: number; // ROLE tokens (morphological pattern detected)
  rel: number; // REL tokens
  str: number; // STR tokens
  lit: number; // LIT (unrecognized) tokens
  litRatio: number; // lit / total — lower is better
}

// ── Vocab entry shape (mirrors JSON files) ───────────────────────────────────

export interface StemEntry {
  field: string; // e.g. "write" or "tech.code"
  gloss: string; // e.g. "write, record, inscribe"
  level2?: string; // explicit level-2 override if field is level-1 only
}

export interface DirectEntry {
  type: TokenType;
  field?: string;
  structure?: string;
  relation?: string;
  gloss: string;
}

export interface CompoundEntry {
  field: string;
  gloss: string;
}
