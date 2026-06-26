#!/usr/bin/env node
/*
 * add-ar-names-geo.mjs — geography + unambiguous proper names (the biggest remaining LIT category).
 * Countries/cities/continents → place; given names with NO common-word reading → person.
 * SKIPS names that double as common words (جدة grandmother, المدينة the-city, خالد eternal, سعيد happy,
 * أمين trustworthy, كريم generous, صلاح righteousness, الرياض gardens) to protect precision. Added as
 * {word} (exact surface). Idempotent. Run then `npm run vocab`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const VOCAB = resolve(dirname(fileURLToPath(import.meta.url)), "../vocab");
const concepts = JSON.parse(readFileSync(`${VOCAB}/concepts.json`, "utf-8"));

const ADD = {
  place: [
    // Arab world
    "مصر", "العراق", "سوريا", "لبنان", "الأردن", "السعودية", "اليمن", "ليبيا", "تونس", "الجزائر",
    "المغرب", "قطر", "البحرين", "عُمان", "الإمارات", "الصومال", "موريتانيا", "جيبوتي",
    // wider world
    "تركيا", "إيران", "الهند", "الصين", "اليابان", "أمريكا", "كندا", "إسبانيا", "البرتغال", "بلجيكا",
    "سويسرا", "السويد", "النرويج", "اليونان", "المكسيك", "البرازيل", "الأرجنتين", "أستراليا", "نيوزيلندا",
    "باكستان", "بنغلاديش", "إندونيسيا", "ماليزيا", "تايلاند", "فيتنام", "الفلبين", "نيجيريا", "كينيا",
    // continents / regions (single-token only — constraint 15: no spaces in keys)
    "أوروبا", "آسيا", "أفريقيا", "إفريقيا",
    // cities (non-ambiguous)
    "القاهرة", "بغداد", "دمشق", "بيروت", "مكة", "القدس", "الدوحة", "إسطنبول", "باريس", "روما",
    "برلين", "موسكو", "واشنطن", "نيويورك", "طوكيو", "دبي", "أبوظبي", "الإسكندرية", "صنعاء", "طرابلس",
  ],
  person: [
    // Arabic given names with no common-word reading
    "إبراهيم", "إسماعيل", "يوسف", "يعقوب", "إسحاق", "موسى", "هارون", "داود", "سليمان", "عيسى",
    "يحيى", "زكريا", "مريم", "عائشة", "فاطمة", "خديجة", "إدريس", "يونس", "آدم", "نوح",
    // more foreign names
    "روزفلت", "كينيدي", "لينكولن", "ماركس", "فرويد", "بيتهوفن", "موزارت", "شكسبير", "نيوتن", "غاليليو",
  ],
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
console.log(`AR names/geo: +${added} surfaces, ${skipped} dup, across ${Object.keys(ADD).length} fields.`);
