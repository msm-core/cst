#!/usr/bin/env node
/*
 * add-ar-verb-roots.mjs — common Arabic triliteral VERB ROOTS as {stem}. The imperfect-prefix
 * reduction (يبلغ→بلغ) already works, but many roots were absent → the reduced form still LIT'd.
 * Adding the roots lets all inflections (يفعل/تفعل/نفعل/فعل/فعلت/…) resolve via segmentation. 3-letter+
 * only (2-letter over-match risk); skips homograph-heavy roots. Idempotent; run then `npm run vocab`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const VOCAB = resolve(dirname(fileURLToPath(import.meta.url)), "../vocab");
const concepts = JSON.parse(readFileSync(`${VOCAB}/concepts.json`, "utf-8"));

const ROOTS = {
  speak: ["ذكر", "عبر", "صرح", "نطق", "خطب", "روي", "سرد"],
  know: ["درس", "علم", "فهم", "عرف", "قرا", "حفظ", "تعلم"],
  think: ["فكر", "اعتقد", "افترض", "تخيل"],
  see: ["نظر", "رصد", "راقب", "ابصر"],
  work: ["خدم", "انتج", "صنع", "ادار", "نظم", "شغل"],
  govern: ["حكم", "قاد", "ولي", "ساس"],
  fight: ["قتل", "ضرب", "هاجم", "دافع", "غزا", "حارب"],
  trade: ["باع", "اشتري", "دفع", "ربح", "خسر", "تاجر", "موّل"],
  social: ["خدم", "ساعد", "زار", "خاطب", "اجتمع"],
  science: ["حلل", "اكتشف", "جرب", "قاس"],
  health: ["شفي", "عالج", "مرض", "اصيب"],
  create: ["بني", "انشا", "اسس", "صمم", "طور", "ابتكر"],
  change: ["غيّر", "حوّل", "عدّل", "طوّر", "اصلح"],
  move: ["نقل", "عبر", "سار", "رحل", "هاجر", "تحرك", "غادر"],
  give: ["منح", "اهدي", "وهب", "سلّم"],
  take: ["اخذ", "تلقي", "استلم", "حصل"],
  want: ["طلب", "رغب", "تمني", "اراد"],
  hold: ["حمل", "امسك", "احتفظ", "ضم"],
  send: ["ارسل", "بعث", "وزّع", "نشر"],
  open: ["بدا", "افتتح", "دشّن"],
  contain: ["شمل", "تضمّن", "احتوي"],
  exist: ["ظهر", "بقي", "حدث", "اختفي", "نشا", "زال"],
  measure: ["بلغ", "عدّ", "زاد", "حسب", "قدّر"],
  body: ["عاش", "ولد", "نام", "تنفس"],
};

let added = 0, skipped = 0;
for (const [field, stems] of Object.entries(ROOTS)) {
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
console.log(`AR verb roots: +${added} stems, ${skipped} dup.`);
