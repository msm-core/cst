#!/usr/bin/env node
/*
 * add-ar-routing-vocab.mjs — append domain-relevant Arabic concept vocabulary to concepts.json,
 * then the normal build-vocab regenerates ar/stems.json. Targets the intent-routing domains (mined
 * from the nemo benchmark's AR LIT), NOT Wikipedia. Conservative: only clearly domain-discriminative
 * words; generic cross-domain words (speed/index/warning) are intentionally skipped to protect precision.
 * Idempotent (dedups against existing stems). Entries are base stems (loader normalizes ة→ه, alef, etc.).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const VOCAB = resolve(dirname(fileURLToPath(import.meta.url)), "../vocab");
const concepts = JSON.parse(readFileSync(`${VOCAB}/concepts.json`, "utf-8"));

// field → [Arabic base stems]. L1 FIELDS ONLY (nemo collapses to L1; L2 would override L1 test
// expectations). Conservative: clearly domain-discriminative content words + brand/domain entities
// (they carry routing signal). Ambiguous/short words (كم "how much", الم) are intentionally excluded.
const ADD = {
  tech: ["بايثون", "سكريبت", "نود", "جيت", "هاب", "خوارزميه", "متغير", "حزمه", "اختبار", "تعطل", "تسرب", "خادم", "تطبيق", "برمجه"],
  weather: ["رطوبه", "ضباب", "جبهه", "عاصفه", "هطول", "امطار"],
  health: ["صداع", "حمي", "طفح", "غثيان", "زكام", "دوار", "ايبوبروفين", "مسكن", "كوليسترول", "لياقه"],
  food: ["معكرونه", "كيكه", "يخنه", "مقلاه", "سوشي", "نودلز", "عجين", "شوكولاته", "سلمون", "وصفه"],
  time: ["منبه", "مؤقت", "اسبوعي", "تقويم", "تذكير"],
  trade: ["بتكوين", "يورو", "بطاقه", "ائتمان", "فاتوره", "محفظه", "تامين", "مشتريات", "شحنه"],
  move: ["اجره", "مترو", "حافله", "عباره", "سائق", "رحله", "تذكره"],
  social: ["صديق", "حظر", "زميل", "تهنئه", "تعليق"],
  place: ["فندق", "بنزين", "صيدليه", "مطعم"],
  sport: ["فورمولا", "مباراه", "ميداليه", "ماراثون", "غولف", "ميسي", "كريكت", "رغبي", "بطوله", "ملاكمه"],
  art: ["جاز", "البوم", "سبوتيفاي", "وثائقي", "نتفليكس", "مسلسل", "جرافيك"],
  science: ["ثقب", "حمض", "نووي", "زلزال", "انشطار", "صفائح", "تكتوني", "مريخ", "نسبيه", "لقاح"],
};

let added = 0, skipped = 0;
for (const [field, stems] of Object.entries(ADD)) {
  if (!concepts[field]) concepts[field] = { en: [], ar: [] };
  if (!Array.isArray(concepts[field].ar)) concepts[field].ar = [];
  const have = new Set(concepts[field].ar.map((e) => e.stem || e.word));
  for (const stem of stems) {
    if (have.has(stem)) { skipped++; continue; }
    concepts[field].ar.push({ stem });
    have.add(stem);
    added++;
  }
}
writeFileSync(`${VOCAB}/concepts.json`, JSON.stringify(concepts, null, 2) + "\n");
console.log(`AR routing vocab: +${added} stems added, ${skipped} already present, across ${Object.keys(ADD).length} fields.`);
