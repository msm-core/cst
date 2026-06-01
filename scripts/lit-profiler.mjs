#!/usr/bin/env node
/**
 * scripts/lit-profiler.mjs — LIT-ratio profiler for @msm-core/cst
 *
 * Usage:
 *   node scripts/lit-profiler.mjs [options]
 *
 * Options:
 *   --lang <en|ar|auto>      Language to use (default: auto)
 *   --input <file>           Plain text file OR JSON eval file (one sentence per line
 *                            or [{text:"..."},...] format)
 *   --top <n>                Number of top unknown words to show (default: 30)
 *   --domain <name>          Label for the report (default: "general")
 *   --limit <n>              Max number of sentences to process (default: all)
 *
 * Built-in datasets (no --input needed):
 *   --dataset en             plan/data/eval-en-10k.json
 *   --dataset ar             plan/data/eval-ar-10k.json
 *
 * Examples:
 *   node scripts/lit-profiler.mjs --dataset en
 *   node scripts/lit-profiler.mjs --dataset ar --limit 1000
 *   node scripts/lit-profiler.mjs --lang en --input my-corpus.txt --top 50
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");

// ── Import tokenizer from built dist ─────────────────────────────────────────
const { tokenize, tokenizeEn, tokenizeAr } = await import(
  resolve(ROOT, "dist/index.js")
);

// ── CLI argument parsing ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

const langArg = flag("--lang") ?? "auto";
const inputFile = flag("--input");
const topN = parseInt(flag("--top") ?? "30", 10);
const domainLabel = flag("--domain") ?? "general";
const limitArg = flag("--limit");
const limit = limitArg ? parseInt(limitArg, 10) : Infinity;
const dataset = flag("--dataset");

// ── Load sentences ────────────────────────────────────────────────────────────
function loadSentences() {
  let filePath;

  if (dataset === "en") {
    filePath = resolve(ROOT, "plan/data/eval-en-10k.json");
  } else if (dataset === "ar") {
    filePath = resolve(ROOT, "plan/data/eval-ar-10k.json");
  } else if (dataset === "ar-domain") {
    filePath = resolve(ROOT, "plan/data/eval-ar-domain.json");
  } else if (inputFile) {
    filePath = resolve(process.cwd(), inputFile);
  } else {
    console.error(
      "Error: provide --dataset <en|ar|ar-domain> or --input <file>\n" +
        "Run with --help for usage.",
    );
    process.exit(1);
  }

  const raw = readFileSync(filePath, "utf8").trim();

  // JSON array format: [{text: "..."}, ...]
  if (raw.startsWith("[")) {
    const parsed = JSON.parse(raw);
    return parsed.map((entry) => ({
      text: entry.text ?? entry,
      domain: entry.domain ?? domainLabel,
    }));
  }

  // Plain text: one sentence per line
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => ({
      text: line.trim(),
      domain: domainLabel,
    }));
}

const allSentences = loadSentences();
const sentences = allSentences.slice(0, limit);

// ── Tokenize ──────────────────────────────────────────────────────────────────
function tokenizeSentence(text) {
  if (langArg === "en") return tokenizeEn(text);
  if (langArg === "ar") return tokenizeAr(text);
  return tokenize(text); // auto-detect
}

// ── Aggregate stats ───────────────────────────────────────────────────────────
const counts = { total: 0, ROOT: 0, ROLE: 0, REL: 0, STR: 0, LIT: 0 };
const unknownWords = new Map(); // surface → { count, contexts[] }
const domainStats = new Map(); // domain → { total, LIT }
const fieldFreq = new Map(); // field → count (for ROOT tokens)

console.error(`Processing ${sentences.length} sentences…`);

for (const { text, domain } of sentences) {
  let output;
  try {
    output = tokenizeSentence(text);
  } catch {
    continue;
  }

  const { tokens } = output;

  for (const tok of tokens) {
    counts.total++;
    counts[tok.type]++;

    // Track domain
    if (!domainStats.has(domain)) domainStats.set(domain, { total: 0, LIT: 0 });
    const ds = domainStats.get(domain);
    ds.total++;
    if (tok.type === "LIT") ds.LIT++;

    // Track unknowns
    if (tok.type === "LIT") {
      const key = tok.surface.toLowerCase();
      if (!unknownWords.has(key)) {
        unknownWords.set(key, { count: 0, example: text.slice(0, 60) });
      }
      unknownWords.get(key).count++;
    }

    // Track field frequency
    if (tok.type === "ROOT" && tok.field) {
      fieldFreq.set(tok.field, (fieldFreq.get(tok.field) ?? 0) + 1);
    }
  }
}

// ── Format helpers ────────────────────────────────────────────────────────────
const pct = (n, total) =>
  total === 0 ? "  0.0%" : `${((n / total) * 100).toFixed(1).padStart(5)}%`;
const bar = (n, total, width = 20) => {
  const filled = total === 0 ? 0 : Math.round((n / total) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
};

// ── Print report ──────────────────────────────────────────────────────────────
const langDisplay =
  langArg === "auto"
    ? `auto (dataset: ${dataset ?? inputFile})`
    : langArg.toUpperCase();

const litRatio = counts.total === 0 ? 0 : counts.LIT / counts.total;
const TARGET = dataset === "ar" ? 0.2 : 0.15;
const verdict =
  litRatio < TARGET
    ? "✅ PASS"
    : litRatio < TARGET + 0.1
      ? "⚠️  BORDERLINE"
      : "❌ FAIL";

console.log("");
console.log("══════════════════════════════════════════════════════");
console.log(`  CST LIT-Ratio Profiler`);
console.log(`  Language : ${langDisplay}`);
console.log(`  Sentences: ${sentences.length.toLocaleString()}`);
console.log(`  Domain   : ${domainLabel}`);
console.log("══════════════════════════════════════════════════════");
console.log("");
console.log("  Token breakdown:");
console.log(
  `  ├─ ROOT  ${bar(counts.ROOT, counts.total)} ${pct(counts.ROOT, counts.total)}  (${counts.ROOT.toLocaleString()})`,
);
console.log(
  `  ├─ ROLE  ${bar(counts.ROLE, counts.total)} ${pct(counts.ROLE, counts.total)}  (${counts.ROLE.toLocaleString()})`,
);
console.log(
  `  ├─ REL   ${bar(counts.REL, counts.total)} ${pct(counts.REL, counts.total)}  (${counts.REL.toLocaleString()})`,
);
console.log(
  `  ├─ STR   ${bar(counts.STR, counts.total)} ${pct(counts.STR, counts.total)}  (${counts.STR.toLocaleString()})`,
);
console.log(
  `  └─ LIT   ${bar(counts.LIT, counts.total)} ${pct(counts.LIT, counts.total)}  (${counts.LIT.toLocaleString()})`,
);
console.log("");
console.log(
  `  LIT ratio: ${(litRatio * 100).toFixed(2)}%  (target < ${(TARGET * 100).toFixed(0)}%)  ${verdict}`,
);
console.log("");

// ── Per-domain breakdown ──────────────────────────────────────────────────────
if (domainStats.size > 1) {
  console.log("  Per-domain LIT ratio:");
  const sorted = [...domainStats.entries()].sort(
    ([, a], [, b]) => b.LIT / b.total - a.LIT / a.total,
  );
  for (const [dom, { total, LIT }] of sorted) {
    const r = LIT / total;
    console.log(`    ${dom.padEnd(22)} ${pct(LIT, total)}  (${LIT}/${total})`);
  }
  console.log("");
}

// ── Top unknown words ─────────────────────────────────────────────────────────
const sortedUnknown = [...unknownWords.entries()]
  .sort(([, a], [, b]) => b.count - a.count)
  .slice(0, topN);

console.log(`  Top ${topN} unknown words (LIT candidates):`);
console.log(`  ${"Word".padEnd(22)} Occurrences  Example context`);
console.log(`  ${"─".repeat(70)}`);
for (const [word, { count, example }] of sortedUnknown) {
  const display = word.length > 20 ? word.slice(0, 19) + "…" : word;
  console.log(
    `  ${display.padEnd(22)} ${String(count).padStart(6)}x   ${example}`,
  );
}
console.log("");

// ── Top fields hit ────────────────────────────────────────────────────────────
if (fieldFreq.size > 0) {
  const sortedFields = [...fieldFreq.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15);
  console.log("  Most active semantic fields (ROOT tokens):");
  for (const [field, count] of sortedFields) {
    console.log(`    ${field.padEnd(20)} ${count.toLocaleString()}`);
  }
  console.log("");
}

// ── Quick recommendation ──────────────────────────────────────────────────────
console.log("  Recommendation:");
if (litRatio < TARGET) {
  console.log(`  Coverage is good. No urgent action needed.`);
} else {
  const topWords = sortedUnknown
    .slice(0, 5)
    .map(([w]) => w)
    .join(", ");
  console.log(
    `  Add morphological stripping or vocab entries for top unknowns:`,
  );
  console.log(`  → ${topWords}`);
  console.log(
    `  Phase 1 (English morphological stripper) is the highest-ROI fix.`,
  );
}
console.log("══════════════════════════════════════════════════════");
console.log("");
