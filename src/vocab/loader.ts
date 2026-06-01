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

type StemsFile = Record<string, StemEntry>;
type CompoundsFile = Record<string, CompoundEntry>;
type FunctionFile = Record<string, DirectEntry>;
type MorphFile = { suffixes: MorphRule[]; prefixes: MorphRule[] };

export interface MorphRule {
  suffix?: string;
  prefix?: string;
  role: string;
  gloss: string;
}

let _enStems: StemsFile | null = null;
let _enWords: Record<string, StemEntry> | null = null;
let _enCompounds: CompoundsFile | null = null;
let _enFunctions: FunctionFile | null = null;
let _enMorph: MorphFile | null = null;

// ── Public loaders ────────────────────────────────────────────────

export function getEnStems(): StemsFile {
  if (!_enStems) _enStems = loadJson<StemsFile>("en/stems.json");
  return _enStems;
}

/** Irregular / direct surface-form words (pre-segmentation lookup, step 5). */
export function getEnWords(): Record<string, StemEntry> {
  if (!_enWords)
    _enWords = loadJson<Record<string, StemEntry>>("en/words.json");
  return _enWords;
}

export function getEnCompounds(): CompoundsFile {
  if (!_enCompounds)
    _enCompounds = loadJson<CompoundsFile>("en/compounds.json");
  return _enCompounds;
}

export function getEnFunctions(): FunctionFile {
  if (!_enFunctions)
    _enFunctions = loadJson<FunctionFile>("en/function-words.json");
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

  return (
    stems[lower] ??
    stems[lower + "e"] ?? // write → writ? → write
    stems[lower + "y"] ?? // study → studi? → study
    null
  );
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

// ── Arabic vocab cache ────────────────────────────────────────────────────────

type ArStemsFile = Record<string, string>; // Arabic root stem → field name (post-segmentation)
type ArWordsFile = Record<string, string>; // Arabic surface word → field name (pre-segmentation)
type ArCompoundsFile = Record<string, string>; // Arabic phrase → field name
type ArStructFile = Record<string, string>; // Arabic word → STR marker
type ArRelFile = Record<string, string>; // Arabic word → REL category

let _arStems: ArStemsFile | null = null;
let _arWords: ArWordsFile | null = null;
let _arCompounds: ArCompoundsFile | null = null;
let _arStruct: ArStructFile | null = null;
let _arRel: ArRelFile | null = null;
let _arFunc: Set<string> | null = null;

/** Root stems — consulted at lookup step 6 (after segmentation). */
export function getArStems(): ArStemsFile {
  if (!_arStems) _arStems = loadJson<ArStemsFile>("ar/stems.json");
  return _arStems;
}

/** Surface word forms — consulted at lookup step 5 (before segmentation). */
export function getArWords(): ArWordsFile {
  if (!_arWords) _arWords = loadJson<ArWordsFile>("ar/words.json");
  return _arWords;
}

export function getArCompounds(): ArCompoundsFile {
  if (!_arCompounds)
    _arCompounds = loadJson<ArCompoundsFile>("ar/compounds.json");
  return _arCompounds;
}

export function getArStructural(): ArStructFile {
  if (!_arStruct) _arStruct = loadJson<ArStructFile>("ar/structural.json");
  return _arStruct;
}

export function getArRelations(): ArRelFile {
  if (!_arRel) _arRel = loadJson<ArRelFile>("ar/relations.json");
  return _arRel;
}

export function getArFunctionWords(): Set<string> {
  if (!_arFunc) {
    const arr = loadJson<string[]>("ar/function-words.json");
    _arFunc = new Set(arr);
  }
  return _arFunc;
}
