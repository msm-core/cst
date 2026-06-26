#!/usr/bin/env node
/*
 * add-ar-core-vocab.mjs — core Arabic content vocabulary as {stem} entries (generalise across
 * inflections via cst segmentation). Common verbs/nouns/adjectives across all L1 fields. Skips
 * auxiliaries/grammatical words (كان/يكن/وتم/فهي) and morphology-colliding agent/passive forms.
 * Stems are normalised base forms (no ال, ة→ه, bare alef). Idempotent; run then `npm run vocab`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const VOCAB = resolve(dirname(fileURLToPath(import.meta.url)), "../vocab");
const concepts = JSON.parse(readFileSync(`${VOCAB}/concepts.json`, "utf-8"));

const ADD = {
  speak: ["صرح", "اعلن", "ذكر", "اشار", "اضاف", "نفي", "اجاب", "خطاب", "حديث", "تصريح", "نطق", "روي"],
  know: ["اكتشف", "معلومه", "معرفه", "دراسه", "تقرير", "مصدر", "وثيقه", "سجل", "ارشيف"],
  think: ["اعتقد", "راي", "فكره", "عقل", "ذكاء", "تفكير", "افتراض", "نظره"],
  see: ["شاهد", "رصد", "مشهد", "رؤيه", "منظر", "مراقبه"],
  work: ["وظيفه", "مهنه", "موظف", "انتاج", "مصنع", "خدمه", "اداره", "عامل", "تشغيل", "استخدم", "استخدام"],
  govern: ["دوله", "حكومه", "وزير", "سياسه", "برلمان", "قانون", "سلطه", "نظام", "انتخابات", "حزب", "وزاره", "دستور", "سفير"],
  fight: ["جيش", "قتال", "سلاح", "هجوم", "دفاع", "نزاع", "صراع", "قوات", "عسكري", "اعتداء", "ثوره", "تمرد", "حصار"],
  trade: ["تجاره", "سوق", "اقتصاد", "استثمار", "بنك", "ضريبه", "ربح", "تصدير", "استيراد", "ميزانيه", "ديون"],
  social: ["مجتمع", "عائله", "اسره", "علاقه", "اجتماع", "شعب", "سكان", "عضو", "منظمه", "جمعيه", "مؤسسه", "وفد"],
  science: ["نظريه", "تجربه", "طاقه", "ذره", "خليه", "كيمياء", "فيزياء", "رياضيات", "فضاء", "كوكب", "جاذبيه", "تطور", "وراثه"],
  health: ["مرض", "علاج", "دواء", "طبيب", "مستشفي", "عدوي", "فيروس", "وباء", "اصابه", "جراحه", "تطعيم"],
  tech: ["حاسوب", "برنامج", "انترنت", "شبكه", "جهاز", "بيانات", "رقمي", "الكتروني", "موقع", "تقنيه", "نظام", "تطوير"],
  art: ["فن", "موسيقي", "روايه", "لوحه", "مسرح", "ثقافه", "ادب", "شعر", "تمثيل", "اخراج", "معرض", "تحفه"],
  sport: ["رياضه", "لعبه", "لاعب", "هدف", "فوز", "ملعب", "منتخب", "تدريب", "بطل"],
  nature: ["طبيعه", "بحر", "جبل", "نهر", "غابه", "صحراء", "سماء", "شمس", "قمر", "نجم", "بحيره", "ساحل", "وادي"],
  weather: ["طقس", "مطر", "رياح", "ثلج", "مناخ", "غيوم", "اعصار"],
  animal: ["حيوان", "طائر", "سمك", "اسد", "حصان", "طيور", "ثديي", "زواحف"],
  plant: ["نبات", "شجره", "زهره", "محصول", "قمح", "غابه", "بذور"],
  body: ["راس", "قلب", "عظم", "وجه", "دماغ", "رئه", "كبد", "جلد", "عضله"],
  food: ["طعام", "اكل", "لحم", "فاكهه", "خضار", "شراب", "وجبه", "حلوي", "مشروب"],
  // NB: ذهب excluded — homograph "gold"(material) / "went"(move); فضه excluded — collides with فضّ.
  material: ["حديد", "خشب", "زجاج", "بلاستيك", "معدن", "نحاس", "اسمنت", "قطن", "صوف"],
  color: ["لون", "احمر", "اخضر", "ازرق", "اصفر", "ابيض", "اسود", "بني"],
  time: ["عصر", "قرن", "فتره", "لحظه", "حقبه", "ماضي", "مستقبل", "حاضر", "زمن", "موسم"],
  place: ["قريه", "شارع", "منطقه", "عاصمه", "بلد", "حي", "ميدان", "ساحه", "اقليم", "محافظه", "ضاحيه"],
  move: ["سافر", "انتقل", "غادر", "قطار", "سفينه", "هجره", "عبور", "وصول", "مغادره", "تنقل"],
  size: ["حجم", "طول", "عرض", "مساحه", "عمق", "ضخم", "هائل"],
  measure: ["كميه", "مقدار", "وزن", "نسبه", "متوسط", "اجمالي", "معدل", "احصاء"],
  quality: ["جوده", "نوع", "صفه", "ميزه", "حاله", "طابع", "خاصيه"],
  create: ["انشا", "بني", "صنع", "انتج", "اخترع", "تصميم", "تاسيس", "بناء", "تشييد"],
  change: ["تطور", "تحول", "عدل", "تقدم", "تغيير", "اصلاح", "تحديث", "توسع"],
  exist: ["ظهور", "نشاه", "وجود", "حدوث", "اختفاء", "بقاء"],
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
console.log(`AR core vocab: +${added} stems, ${skipped} dup, across ${Object.keys(ADD).length} fields.`);
