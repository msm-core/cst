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
 * CONCEPT  — content word mapped to a semantic field
 *            compact: "CONCEPT:tech.code" or "CONCEPT:tech.code:agent"
 * REL      — relational/function word (preposition, conjunction)
 *            compact: "REL:in" / "REL:causes"
 * STR      — sentence-level structure marker
 *            compact: "STR:question" / "STR:negation" / "STR:modal"
 * LIT      — literal fallback (named entity, unknown word)
 *            compact: "LIT:iPhone" (surface preserved)
 */
export type TokenType = "CONCEPT" | "REL" | "STR" | "LIT";

// ── Main token interface ──────────────────────────────────────────────────────

export interface CSTToken {
  // What kind of token
  type: TokenType;

  // Semantic analysis (consumed by HDC / ML)
  field?: string;      // "tech.code" | "tech" — level-2 or level-1
  role?: string;       // morphological role: "agent" | "patient" | "instance" ...
  relation?: string;   // REL category: "in" | "causes" | "before" ...
  structure?: string;  // STR marker: "question" | "negation" | "modal" | "past" ...

  // Surface preservation (NEVER dropped)
  surface: string;     // exact original word from input
  gloss?: string;      // human-readable meaning: "write, record" — from vocab file

  // Serializable compact form for model consumption
  // Format: "TYPE:field" | "TYPE:field:role" | "STR:marker" | "LIT:surface"
  compact: string;

  // Language and position
  lang: "en" | "ar" | "mixed";
  offset: [number, number]; // [start, end] char offsets in original input string

  // Confidence 0.0–1.0
  confidence: number;

  // Arabic-specific (undefined for English)
  root?: string;    // trilateral root: "كتب"
  pattern?: string; // وزن form label: "agent" | "patient" | "instance" ...
}

// ── Tokenizer output ─────────────────────────────────────────────────────────

export interface CSTOutput {
  tokens: CSTToken[];
  coverage: CoverageSummary;
}

export interface CoverageSummary {
  total: number;
  concept: number;  // CONCEPT tokens
  rel: number;      // REL tokens
  str: number;      // STR tokens
  lit: number;      // LIT (unrecognized) tokens
  litRatio: number; // lit / total — lower is better
}

// ── Vocab entry shape (mirrors JSON files) ───────────────────────────────────

export interface StemEntry {
  field: string;    // e.g. "write" or "tech.code"
  gloss: string;    // e.g. "write, record, inscribe"
  level2?: string;  // explicit level-2 override if field is level-1 only
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
