#!/usr/bin/env node
/*
 * add-ar-final-batch.mjs — last targeted batch from the current top-120 LIT. Demonyms/proper-adjectives
 * + media/orgs → name; people-groups → social; clear content verbs → fields. SKIPS auxiliaries (يبلغ/
 * يكن/وتم/فهي), abbreviations (هـ/ق/٪/BBC), and homograph names (صلاح/خان/فارس/محمود). {word} for exact
 * surfaces, {stem} for verbs. Idempotent; run then `npm run vocab`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const VOCAB = resolve(dirname(fileURLToPath(import.meta.url)), "../vocab");
const concepts = JSON.parse(readFileSync(`${VOCAB}/concepts.json`, "utf-8"));

const WORDS = {
  // proper-derived adjectives (demonyms) + media/orgs → generic named entity
  name: ["الفلسطينية", "الإسرائيلية", "الرومانية", "الروماني", "اليونانية", "اللاتينية", "الإيطالية", "النازية", "الصهيونية", "فلسطيني", "بريطاني", "كويتي", "تايمز", "طالبان", "الكاثوليكية", "الكاثوليك", "الأممية", "الفيدرالية"],
  // people-groups / peoples
  social: ["اليهود", "الدروز", "المسيحيين", "الأتراك", "المغول", "الأمريكيين", "الصليبيين", "الأوروبيين", "العثمانيين"],
  person: ["باشا", "الإمبراطور", "فيروز", "النبي", "نسمة"],
  place: ["أنحاء", "القطاع", "قطاع"],
  exist: ["وفاة", "وفيات", "وفاته", "نشأة"],
  time: ["مواليد", "الغريغوري", "الكبيسة", "ميلادي", "هجري", "التاريخية", "حقبة"],
  trade: ["الناتج", "ناتج", "الصادرات", "الواردات"],
  measure: ["جزء", "الجزء", "زاوية", "أجزاء"],
};
const STEMS = {
  measure: ["ميل", "نقص", "بلغ"], // بلغ "amounts to/reaches (a quantity)" — high-freq quantity verb
  work: ["استخدم", "تشغيل"],
  speak: ["سمي", "عني", "نطق"],
  decide: ["اختار", "رفض", "اقرار"],
  move: ["اطلاق", "اطلق"],
  see: ["شهد", "رصد"],
  know: ["وسيله", "اعلام"],
  measure: ["ميل", "نقص"],
};

let added = 0, skipped = 0;
const apply = (map, kind) => {
  for (const [field, items] of Object.entries(map)) {
    if (!concepts[field]) concepts[field] = { en: [], ar: [] };
    if (!Array.isArray(concepts[field].ar)) concepts[field].ar = [];
    const have = new Set(concepts[field].ar.map((e) => e.stem || e.word));
    for (const it of items) {
      if (have.has(it)) { skipped++; continue; }
      concepts[field].ar.push(kind === "word" ? { word: it } : { stem: it });
      have.add(it);
      added++;
    }
  }
};
apply(WORDS, "word");
apply(STEMS, "stem");
writeFileSync(`${VOCAB}/concepts.json`, JSON.stringify(concepts, null, 2) + "\n");
console.log(`AR final batch: +${added} entries, ${skipped} dup.`);
