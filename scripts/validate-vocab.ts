#!/usr/bin/env node
/**
 * scripts/validate-vocab.ts
 *
 * The vocabulary gate — run by `npm test` to prevent bad data from reaching the tokenizer.
 *
 * Rules enforced (BIBLE §13, constraints 13–15):
 *   1. Every value in stems.json / words.json / compounds.json must exist in spec/fields.json.
 *   2. Every value in relations.json must exist in spec/relations.json.
 *   3. Every value in structural.json must exist in spec/structural.json.
 *   4. No key may appear in BOTH stems.json AND words.json of the same language adapter.
 *   5. No key in stems.json or words.json may contain a space.
 *   6. No _comment keys appear in output counts (they are allowed as metadata).
 *
 * Exit code: 0 = all valid, 1 = violations found.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = fileURLToPath(new URL(".", import.meta.url));
const VOCAB_ROOT = resolve(__dir, "../vocab");
const SPEC_DIR = join(VOCAB_ROOT, "spec");

// ── Load spec atoms ───────────────────────────────────────────────────────────

function loadSpec(file: string): Set<string> {
  const raw = JSON.parse(readFileSync(join(SPEC_DIR, file), "utf-8")) as Record<
    string,
    string
  >;
  return new Set(Object.keys(raw).filter((k) => k !== "_comment"));
}

const VALID_FIELDS = loadSpec("fields.json");
const VALID_RELATIONS = loadSpec("relations.json");
const VALID_STRUCTURAL = loadSpec("structural.json");

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadJson(path: string): Record<string, string> {
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, string>;
}

function langDirs(): string[] {
  return readdirSync(VOCAB_ROOT).filter((d) => {
    const full = join(VOCAB_ROOT, d);
    return statSync(full).isDirectory() && d !== "spec";
  });
}

// ── Validation ────────────────────────────────────────────────────────────────

interface Violation {
  file: string;
  key: string;
  value: string;
  rule: string;
}

const violations: Violation[] = [];

function check(
  filePath: string,
  validSet: Set<string>,
  ruleName: string,
): Record<string, string> {
  let data: Record<string, string>;
  try {
    data = loadJson(filePath);
  } catch {
    // File doesn't exist — not an error (optional files)
    return {};
  }

  for (const [key, value] of Object.entries(data)) {
    if (key === "_comment") continue;
    if (!validSet.has(value)) {
      violations.push({
        file: filePath.replace(VOCAB_ROOT + "/", ""),
        key,
        value,
        rule: ruleName,
      });
    }
  }
  return data;
}

function checkNoSpace(filePath: string, label: string): Record<string, string> {
  let data: Record<string, string>;
  try {
    data = loadJson(filePath);
  } catch {
    return {};
  }
  for (const key of Object.keys(data)) {
    if (key === "_comment") continue;
    if (key.includes(" ")) {
      violations.push({
        file: filePath.replace(VOCAB_ROOT + "/", ""),
        key,
        value: data[key],
        rule: "Key contains space — belongs in compounds.json",
      });
    }
  }
  return data;
}

function checkNoCrossFileDup(
  stemsPath: string,
  wordsPath: string,
  lang: string,
): void {
  let stems: Record<string, string>;
  let words: Record<string, string>;
  try {
    stems = loadJson(stemsPath);
  } catch {
    stems = {};
  }
  try {
    words = loadJson(wordsPath);
  } catch {
    words = {};
  }

  for (const key of Object.keys(words)) {
    if (key === "_comment") continue;
    if (key in stems) {
      violations.push({
        file: `${lang}/words.json`,
        key,
        value: words[key],
        rule: `Duplicate key also in ${lang}/stems.json — remove from words.json`,
      });
    }
  }
}

// ── Run validation for each language adapter ─────────────────────────────────

for (const lang of langDirs()) {
  const dir = join(VOCAB_ROOT, lang);

  const stemsPath = join(dir, "stems.json");
  const wordsPath = join(dir, "words.json");
  const compoundsPath = join(dir, "compounds.json");
  const relPath = join(dir, "relations.json");
  const strPath = join(dir, "structural.json");

  // Rule 1: field values must be valid
  const stemsData = check(
    stemsPath,
    VALID_FIELDS,
    "Invalid field in stems.json",
  );
  checkNoSpace(stemsPath, lang);

  const wordsData = check(
    wordsPath,
    VALID_FIELDS,
    "Invalid field in words.json",
  );
  checkNoSpace(wordsPath, lang);

  check(compoundsPath, VALID_FIELDS, "Invalid field in compounds.json");

  // Rule 2: REL values must be valid
  // Arabic relations.json maps surface word → "REL:xxx" or plain category name
  // We accept both formats
  try {
    const relData = loadJson(relPath);
    for (const [key, value] of Object.entries(relData)) {
      if (key === "_comment") continue;
      const cat = value.replace(/^REL:/, "");
      if (!VALID_RELATIONS.has(cat)) {
        violations.push({
          file: `${lang}/relations.json`,
          key,
          value,
          rule: "Invalid REL category",
        });
      }
    }
  } catch {
    /* optional */
  }

  // Rule 3: STR values must be valid
  try {
    const strData = loadJson(strPath);
    for (const [key, value] of Object.entries(strData)) {
      if (key === "_comment") continue;
      // Arabic structural.json maps surface word → nemo-style type (NEG, MODAL…)
      // or plain STR marker. Accept both for backward compat.
      const marker = value.replace(/^STR:/, "");
      const nemoToMarker: Record<string, string> = {
        NEG: "negation",
        MODAL: "modal",
        COND: "conditional",
        CAUSE: "cause",
        FUTURE: "future",
        PAST: "past",
        QUERY: "question",
      };
      const resolved = nemoToMarker[marker] ?? marker;
      if (!VALID_STRUCTURAL.has(resolved)) {
        violations.push({
          file: `${lang}/structural.json`,
          key,
          value,
          rule: "Invalid STR marker",
        });
      }
    }
  } catch {
    /* optional */
  }

  // Rule 4: no cross-file duplicates
  checkNoCrossFileDup(stemsPath, wordsPath, lang);
}

// ── Report ────────────────────────────────────────────────────────────────────

if (violations.length === 0) {
  console.log("✓ vocab validation passed — 0 violations");
  process.exit(0);
} else {
  console.error(
    `✗ vocab validation FAILED — ${violations.length} violation(s):\n`,
  );
  for (const v of violations) {
    console.error(`  [${v.file}] key="${v.key}" value="${v.value}"`);
    console.error(`    → ${v.rule}`);
  }
  process.exit(1);
}
