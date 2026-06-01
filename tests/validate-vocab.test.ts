/**
 * tests/validate-vocab.test.ts
 *
 * Vocab gate — BIBLE §13 constraints 13–15.
 * Runs automatically as part of `npm test`.
 *
 * Rules:
 *   1. Every field value in stems/words/compounds must exist in spec/fields.json
 *   2. Every value in relations.json must exist in spec/relations.json
 *   3. Every value in structural.json must exist in spec/structural.json
 *   4. No key in BOTH stems.json AND words.json (same adapter)
 *   5. No space in any key of stems.json or words.json
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
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

function loadJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
}

/** Extract field string from either a plain string or {field, gloss} object */
function extractField(val: unknown): string | null {
  if (typeof val === "string") return val;
  if (val && typeof val === "object" && "field" in val)
    return (val as { field: string }).field;
  return null;
}

function langDirs(): string[] {
  return readdirSync(VOCAB_ROOT)
    .filter((d) => statSync(join(VOCAB_ROOT, d)).isDirectory() && d !== "spec")
    .sort();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const langs = langDirs();

describe("Vocab validation — spec/fields.json", () => {
  for (const lang of langs) {
    const dir = join(VOCAB_ROOT, lang);

    const stems = loadJson(join(dir, "stems.json"));
    const words = loadJson(join(dir, "words.json"));
    const compounds = loadJson(join(dir, "compounds.json"));

    test(`${lang}/stems.json — all values are valid field names`, () => {
      const violations: string[] = [];
      for (const [k, v] of Object.entries(stems)) {
        if (k === "_comment") continue;
        const field = extractField(v);
        if (!field || !VALID_FIELDS.has(field))
          violations.push(`${k}: "${field}"`);
      }
      expect(violations).toEqual([]);
    });

    test(`${lang}/words.json — all values are valid field names`, () => {
      const violations: string[] = [];
      for (const [k, v] of Object.entries(words)) {
        if (k === "_comment") continue;
        const field = extractField(v);
        if (!field || !VALID_FIELDS.has(field))
          violations.push(`${k}: "${field}"`);
      }
      expect(violations).toEqual([]);
    });

    test(`${lang}/compounds.json — all values are valid field names`, () => {
      const violations: string[] = [];
      for (const [k, v] of Object.entries(compounds)) {
        if (k === "_comment") continue;
        const field = extractField(v);
        if (!field || !VALID_FIELDS.has(field))
          violations.push(`${k}: "${field}"`);
      }
      expect(violations).toEqual([]);
    });
  }
});

describe("Vocab validation — spec/relations.json", () => {
  for (const lang of langs) {
    const dir = join(VOCAB_ROOT, lang);
    const rel = loadJson(join(dir, "relations.json"));

    test(`${lang}/relations.json — all values are valid REL categories`, () => {
      const violations: string[] = [];
      for (const [k, v] of Object.entries(rel)) {
        if (k === "_comment") continue;
        const cat = typeof v === "string" ? v.replace(/^REL:/, "") : null;
        if (!cat || !VALID_RELATIONS.has(cat)) violations.push(`${k}: "${v}"`);
      }
      expect(violations).toEqual([]);
    });
  }
});

describe("Vocab validation — spec/structural.json", () => {
  for (const lang of langs) {
    const dir = join(VOCAB_ROOT, lang);
    const str = loadJson(join(dir, "structural.json"));

    test(`${lang}/structural.json — all values are valid STR markers`, () => {
      const violations: string[] = [];
      for (const [k, v] of Object.entries(str)) {
        if (k === "_comment") continue;
        const marker = typeof v === "string" ? v.replace(/^STR:/, "") : null;
        if (!marker || !VALID_STRUCTURAL.has(marker))
          violations.push(`${k}: "${v}"`);
      }
      expect(violations).toEqual([]);
    });
  }
});

describe("Vocab validation — cross-file deduplication (constraint 13)", () => {
  for (const lang of langs) {
    const dir = join(VOCAB_ROOT, lang);
    const stems = loadJson(join(dir, "stems.json"));
    const words = loadJson(join(dir, "words.json"));

    test(`${lang} — no key in BOTH stems.json AND words.json`, () => {
      const dups = Object.keys(words).filter(
        (k) => k !== "_comment" && k in stems,
      );
      expect(dups).toEqual([]);
    });
  }
});

describe("Vocab validation — no spaces in single-word files (constraint 15)", () => {
  for (const lang of langs) {
    const dir = join(VOCAB_ROOT, lang);
    const stems = loadJson(join(dir, "stems.json"));
    const words = loadJson(join(dir, "words.json"));

    test(`${lang}/stems.json — no keys containing spaces`, () => {
      const spaced = Object.keys(stems).filter(
        (k) => k !== "_comment" && k.includes(" "),
      );
      expect(spaced).toEqual([]);
    });

    test(`${lang}/words.json — no keys containing spaces`, () => {
      const spaced = Object.keys(words).filter(
        (k) => k !== "_comment" && k.includes(" "),
      );
      expect(spaced).toEqual([]);
    });
  }
});

describe("Vocab validation — function-words.json STR/REL values (constraint 14)", () => {
  for (const lang of langs) {
    const dir = join(VOCAB_ROOT, lang);
    const fw = loadJson(join(dir, "function-words.json"));

    test(`${lang}/function-words.json — STR structure values are valid markers`, () => {
      const violations: string[] = [];
      for (const [k, v] of Object.entries(fw)) {
        if (k === "_comment") continue;
        if (
          v &&
          typeof v === "object" &&
          (v as { type?: string }).type === "STR"
        ) {
          const m = (v as { structure?: string }).structure ?? "";
          if (!VALID_STRUCTURAL.has(m)) violations.push(`${k}: STR:${m}`);
        }
      }
      expect(violations).toEqual([]);
    });

    test(`${lang}/function-words.json — REL relation values are valid categories`, () => {
      const violations: string[] = [];
      for (const [k, v] of Object.entries(fw)) {
        if (k === "_comment") continue;
        if (
          v &&
          typeof v === "object" &&
          (v as { type?: string }).type === "REL"
        ) {
          const m = (v as { relation?: string }).relation ?? "";
          if (!VALID_RELATIONS.has(m)) violations.push(`${k}: REL:${m}`);
        }
      }
      expect(violations).toEqual([]);
    });
  }
});
