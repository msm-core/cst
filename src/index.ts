/**
 * index.ts — Public API for @msm-ai/cst
 *
 * English tokenizer is Phase 1.
 * Arabic tokenizer will be added in Phase 5.
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  CSTToken,
  CSTOutput,
  CoverageSummary,
  TokenType,
  StemEntry,
  DirectEntry,
  CompoundEntry,
} from "./types.js";

// ── Spec (field/role/relation lists) ─────────────────────────────────────────
export {
  FIELDS_L1,
  FIELDS_L2,
  ROLES,
  STR_MARKERS,
  RELATION_CATS,
  parentField,
  isValidField,
} from "./spec.js";
export type {
  Field,
  FieldL1,
  FieldL2,
  Role,
  StrMarker,
  RelationCat,
} from "./spec.js";

// ── Tokenizers ────────────────────────────────────────────────────────────────
export { tokenizeEn } from "./tokenizer/en.js";
export { tokenizeAr } from "./tokenizer/ar.js";
export { tokenize, detectLang } from "./tokenizer/pipeline.js";

// ── Vocab helpers (for consumers that need raw lookup data) ───────────────────
export { getArCompounds } from "./vocab/loader.js";

// ── Detokenizer / Gloss / LLM context ────────────────────────────────────────
export {
  detokenize,
  reconstruct,
  digest,
  gloss,
  toLLMContext,
} from "./detokenizer.js";
