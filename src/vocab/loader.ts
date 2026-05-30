/**
 * vocab/loader.ts — Load and cache vocabulary JSON files.
 *
 * Loads on first access, then keeps in memory.
 * All paths are relative to the package root (vocab/ directory).
 * No runtime dependencies — uses Node.js built-in fs/path only.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { StemEntry, DirectEntry, CompoundEntry } from "../types.js";

// ── Locate vocab directory ────────────────────────────────────────────────────

const __dir = dirname(fileURLToPath(import.meta.url));
// src/vocab/ → go up two levels to package root, then into vocab/
const VOCAB_ROOT = resolve(__dir, "../../vocab");

function loadJson<T>(relPath: string): T {
  const full = resolve(VOCAB_ROOT, relPath);
  const raw = readFileSync(full, "utf-8");
  return JSON.parse(raw) as T;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

type StemsFile    = Record<string, StemEntry>;
type CompoundsFile = Record<string, CompoundEntry>;
type FunctionFile  = Record<string, DirectEntry>;
type MorphFile     = { suffixes: MorphRule[]; prefixes: MorphRule[] };

export interface MorphRule {
  suffix?: string;
  prefix?: string;
  role: string;
  gloss: string;
}

let _enStems: StemsFile | null = null;
let _enCompounds: CompoundsFile | null = null;
let _enFunctions: FunctionFile | null = null;
let _enMorph: MorphFile | null = null;

// ── Public loaders ────────────────────────────────────────────────────────────

export function getEnStems(): StemsFile {
  if (!_enStems) _enStems = loadJson<StemsFile>("en/stems.json");
  return _enStems;
}

export function getEnCompounds(): CompoundsFile {
  if (!_enCompounds) _enCompounds = loadJson<CompoundsFile>("en/compounds.json");
  return _enCompounds;
}

export function getEnFunctions(): FunctionFile {
  if (!_enFunctions) _enFunctions = loadJson<FunctionFile>("en/function-words.json");
  return _enFunctions;
}

export function getEnMorph(): MorphFile {
  if (!_enMorph) _enMorph = loadJson<MorphFile>("en/morphology.json");
  return _enMorph;
}

// ── Stem lookup helpers ───────────────────────────────────────────────────────

/**
 * Look up a word in the English stems map.
 * Tries: exact → lowercase → with trailing 'e' restored.
 * Returns the entry or null.
 */
export function lookupEnStem(word: string): StemEntry | null {
  const stems = getEnStems();
  const lower = word.toLowerCase();

  return stems[lower]
    ?? stems[lower + "e"]   // write → writ? → write
    ?? stems[lower + "y"]   // study → studi? → study
    ?? null;
}

/**
 * Look up a bigram in the English compounds map.
 * Input should be two words already lowercased, joined with a space.
 */
export function lookupEnCompound(bigram: string): CompoundEntry | null {
  const compounds = getEnCompounds();
  return compounds[bigram.toLowerCase()] ?? null;
}

/**
 * Look up a function word in the English function-words map.
 * Returns the direct entry (STR or REL) or null.
 */
export function lookupEnFunction(word: string): DirectEntry | null {
  const funcs = getEnFunctions();
  return funcs[word.toLowerCase()] ?? null;
}
