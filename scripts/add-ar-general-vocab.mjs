#!/usr/bin/env node
/*
 * add-ar-general-vocab.mjs — broad Arabic coverage batch, frequency-prioritised from the Wikipedia
 * LIT miner (top-250). Adds high-frequency surfaces as {word} entries mapped to L1 fields:
 *   places→place, foreign names/titles→person, ordinals/numbers→measure, clear content nouns→fields.
 * CONSERVATIVE: skips demonyms (adjectival, ambiguous field), ambiguous names (صلاح/خان/فارس),
 * religious terms without a field, and pure grammatical words. Idempotent. Run then `npm run vocab`.
 * NOTE: nemo only knows a subset of fields — person/name don't help routing (it skips unknown fields)
 * but DO improve cst's own coverage; place/science/material/etc. help both.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const VOCAB = resolve(dirname(fileURLToPath(import.meta.url)), "../vocab");
const concepts = JSON.parse(readFileSync(`${VOCAB}/concepts.json`, "utf-8"));

const ADD = {
  place: ["بريطانيا", "أفغانستان", "النمسا", "كوريا", "حلب", "لاتفيا", "كرواتيا", "نابلس", "الضفة", "هولندا", "فنلندا", "الخليج", "بولندا", "البلطيق", "إثيوبيا", "رومانيا", "أوكرانيا", "المجر", "الدنمارك", "السودان", "الأندلس", "الشام", "وادي", "جزر", "الجزر", "المحيط", "الأطلسي", "قلعة", "مقر", "إمارة", "قمة", "الأهلية", "البيضاء", "الكويت", "فلسطين", "إسرائيل", "اليونان", "ألمانيا", "روسيا", "إيطاليا", "فرنسا"],
  // FOREIGN proper names only — no Arabic root → never collide with cst morphology (Arabic names like
  // محمود=passive-participle, كاتب=agent-form are derived morphologically; adding them as words breaks that).
  person: ["هتلر", "تشرشل", "مانديلا", "لويس", "أينشتاين", "أرسطو", "جورج", "هنري", "ستيف", "جيمس", "تشارلز", "ويليام", "نابليون", "ديزني", "أوباما", "بوتين", "ستالين", "غاندي"],
  measure: ["التاسع", "الخامس", "السابع", "السادس", "خمس", "آلاف", "ملايين", "المئتين", "نقطة", "درجات", "مرتبة", "المرتبة", "كثافة", "كتلة", "الكتلة", "ارتفاع", "خمسة", "نسبة", "كمية"],
  science: ["العناصر", "عناصر", "الحمض", "النووي", "الانشطار", "الصفائح", "التكتونية", "المريخ", "الكواكب", "الذرة"],
  material: ["النفط", "نفط", "المادة", "مادة", "الغاز", "الحديد", "النحاس"],
  move: ["الطائرات", "طائرات", "اتجاه", "انتشار", "سقوط"],
  sport: ["كأس", "الأولمبية", "لكرة", "بطولات", "الدوري"],
  social: ["مؤتمر", "المؤتمر", "قبائل", "القبائل", "أفراد", "اتفاق", "منظمة", "المنظمات", "السلطات", "أعضاء", "اللجنة"],
  work: ["صناعة", "الصناعات", "منصب", "النشاط", "الإنتاج", "مشروع"],
  fight: ["المسلحة", "الحلفاء", "اغتيال", "حلف", "معركة", "الحرب"],
  time: ["عهد", "العهد", "حقبة", "قرون"],
  think: ["يعتقد", "اعتقاد"],
  contain: ["تضم", "يضم", "تشمل"],
  possess: ["تمتلك", "يمتلك"],
  create: ["تأسست", "أسس", "تأسس", "إنشاء"],
};

let added = 0, skipped = 0;
for (const [field, words] of Object.entries(ADD)) {
  if (!concepts[field]) concepts[field] = { en: [], ar: [] };
  if (!Array.isArray(concepts[field].ar)) concepts[field].ar = [];
  const have = new Set(concepts[field].ar.map((e) => e.stem || e.word));
  for (const word of words) {
    if (have.has(word)) { skipped++; continue; }
    concepts[field].ar.push({ word });
    have.add(word);
    added++;
  }
}
writeFileSync(`${VOCAB}/concepts.json`, JSON.stringify(concepts, null, 2) + "\n");
console.log(`AR general vocab: +${added} surfaces added, ${skipped} dup, across ${Object.keys(ADD).length} fields.`);
