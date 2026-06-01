#!/usr/bin/env python3
"""
scripts/expand-vocab-phase4.py — Phase 4 vocab expansion

Goals:
1. Add high-frequency Arabic function/discourse words to function-words.json
   (from FrequencyWords ar_50k.txt analysis)
2. Add Arabic content words for common semantic fields to concepts.json
3. Add modern AI, tech, and business vocabulary (Arabic + English)
   — this is the PRIMARY focus: CST is used in AI agent workflows
     and customer service, so modern Arabic is essential.

Usage:  python3 scripts/expand-vocab-phase4.py
        node scripts/build-vocab.mjs   # rebuild stems.json from concepts.json
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
CONCEPTS   = ROOT / "vocab" / "concepts.json"
FW_AR      = ROOT / "vocab" / "ar" / "function-words.json"
STRUCT_AR  = ROOT / "vocab" / "ar" / "structural.json"
RELS_AR    = ROOT / "vocab" / "ar" / "relations.json"
COMPOUNDS_AR = ROOT / "vocab" / "ar" / "compounds.json"

def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def save(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  Saved {path}")

# ── Load ──────────────────────────────────────────────────────────────────────
concepts    = load(CONCEPTS)
fw_ar       = load(FW_AR)        # list of skip words
struct_ar   = load(STRUCT_AR)    # dict: word → structure value
rels_ar     = load(RELS_AR)      # dict: word → "REL:xxx"
compounds_ar = load(COMPOUNDS_AR) # dict: phrase → field

# ── Helper: add to concepts.json ──────────────────────────────────────────────
def add_en(field, entries):
    if field not in concepts:
        concepts[field] = {"en": [], "ar": []}
    existing = {e.get("stem") for e in concepts[field].get("en", []) if "stem" in e}
    added = 0
    for e in entries:
        if e["stem"] not in existing:
            concepts[field]["en"].append(e)
            added += 1
    if added:
        print(f"  EN {field}: +{added}")

def add_ar_word(field, entries):
    """Add Arabic surface-form words (words.json) to a field."""
    if field not in concepts:
        concepts[field] = {"en": [], "ar": []}
    existing = {e.get("word") for e in concepts[field].get("ar", []) if "word" in e}
    existing |= {e.get("stem") for e in concepts[field].get("ar", []) if "stem" in e}
    added = 0
    for e in entries:
        key = e.get("word") or e.get("stem")
        if key not in existing:
            concepts[field]["ar"].append(e)
            added += 1
    if added:
        print(f"  AR {field}: +{added}")

def add_fw(words):
    """Add words to the Arabic function-words (skip) list."""
    existing = set(fw_ar)
    added = [w for w in words if w not in existing]
    fw_ar.extend(added)
    if added:
        print(f"  AR function-words: +{len(added)}")

def add_struct(entries):
    """Add Arabic structural words (dict: word → structure)."""
    added = 0
    for word, struct_val in entries.items():
        if word not in struct_ar:
            struct_ar[word] = struct_val
            added += 1
    if added:
        print(f"  AR structural: +{added}")

def add_rel(entries):
    """Add Arabic relational words (dict: word → 'REL:xxx')."""
    added = 0
    for word, rel_val in entries.items():
        if word not in rels_ar:
            rels_ar[word] = rel_val
            added += 1
    if added:
        print(f"  AR relations: +{added}")

def add_compound_ar(entries):
    """Add Arabic compound bigrams (dict: phrase → field)."""
    added = 0
    for phrase, field in entries.items():
        if phrase not in compounds_ar:
            compounds_ar[phrase] = field
            added += 1
    if added:
        print(f"  AR compounds: +{added}")

# ════════════════════════════════════════════════════════════════════════════════
# 1. HIGH-FREQUENCY ARABIC FUNCTION / DISCOURSE WORDS (FrequencyWords derived)
# ════════════════════════════════════════════════════════════════════════════════
print("\n── 1. Arabic function/discourse words (skip list) ──────────────────")

# Emphatic particles, affirmations, discourse fillers
add_fw([
    # Affirmatives / discourse affirmations
    "نعم", "آه", "إي", "أجل", "طبعا", "طبعاً", "تمام", "صحيح", "صح",
    "حسناً", "حسنا", "حسن", "موافق", "أوكي", "أوكى", "اوكيه",
    "رائع", "ممتاز", "عظيم", "بالتأكيد", "بكل", "يقين", "بالضبط",
    "حقاً", "حقا", "فعلاً", "فعلا", "واضح", "بوضوح", "بالفعل",
    "أكيد", "اكيد", "مضبوط", "تماماً",

    # Negative / disagreement
    "آسف", "آسفة", "اسف", "مع الأسف", "مأسوف",
    "اللعنة", "يا إلهي", "يا إله", "لا إله",

    # Greetings / social phrases
    "شكراً", "شكرا", "شكرًا", "مشكور", "مشكورين",
    "أهلاً", "أهلا", "مرحباً", "صباح", "مساء", "خير",
    "السلام", "السلامة", "وداعاً", "وداعا",
    "عفواً", "عفوا", "لا شكر", "على واجب",

    # Modal / stance particles
    "ربما", "لعل", "عسى", "يمكن", "يمكن أن",
    "لقد", "قد", "وقد", "قد يكون",
    "سوف", "سـ",

    # Pronoun + preposition fusions (high frequency, purely discourse)
    "عليك", "عليه", "عليها", "علينا", "عليهم",
    "لديك", "لديه", "لديها", "لدينا", "لديهم",
    "معك", "معه", "معها", "معنا", "معهم",
    "منك", "منه", "منها", "منهم",
    "إليك", "إليه", "إليها", "إلينا", "إليهم",
    "بهذا", "بذلك", "بها", "به", "بهم",
    "لهذا", "لذلك", "لها", "لهم",
    "عنه", "عنها", "عنهم", "عنك",
    "وهذا", "وهذه", "وذلك",
    "فيه", "فيها", "فيهم",

    # Intensifiers / quantifiers used as discourse fillers
    "كثيراً", "كثيرا", "جداً", "جدا", "للغاية",
    "قليلاً", "قليلا", "بعضاً", "بعضا", "فحسب",
    "الكثير", "كثير", "أكثر", "أقل",
    "الجميع", "جميع", "كل", "كلا", "كلها", "كله",
    "بعض", "بعضهم", "بعضنا",

    # Temporal discourse
    "الآن", "الان", "حالاً", "حالا", "الليلة", "هذه الليلة",
    "أحياناً", "أحيانا", "دائماً", "دائما", "أبداً", "أبدا",
    "أخيراً", "أخيرا", "مبكراً", "مبكرا", "بسرعة",
    "فجأة", "فوراً", "فورا", "مباشرة", "مباشرةً",

    # Clause / discourse connectors not in relations
    "بالإضافة", "علاوة", "فضلاً", "فضلا",
    "من ناحية", "من جهة", "من حيث",
    "ومع ذلك", "رغم ذلك", "على الرغم",
    "في الواقع", "في الحقيقة", "في الحال",
    "في الأصل", "في البداية", "في النهاية",
    "هكذا", "وهكذا", "بهذا الشكل",
    "واحدة", "واحد",

    # Common first-person discourse verbs (highly inflected, filler-like)
    "أعرف", "أعرفه", "اعرف",
    "أعتقد", "اعتقد", "أظن", "اظن",
    "أعلم", "اعلم",
    "أعني", "اعني",
    "أريد", "اريد",
    "أقصد", "اقصد",
    "يبدو", "يبدو لي", "يبدولي",

    # "Not" forms not yet in structural
    "لست", "ليست", "لسنا", "لستم",
    "أليس", "أليست",

    # Misc. common discourse
    "يا", "يا سيدي", "سيدتي", "يا سيدتي",
    "بخير", "بكل خير",
    "هيا", "يلا", "يالا",
    "إذن", "إذاً", "اذن",
    "لكن", "لكنه", "لكنها", "لكنهم", "لكننا",
    "أيضاً", "أيضا",
    "خاصة", "خاصةً", "وخاصة",
    "خصوصاً", "خصوصا",
    "أثناء", "خلال", "خلاله",
])

# ════════════════════════════════════════════════════════════════════════════════
# 2. ARABIC STRUCTURAL WORDS (STR tokens)
# ════════════════════════════════════════════════════════════════════════════════
print("\n── 2. Arabic structural words ───────────────────────────────────────")
add_struct({
    # Modal - obligation / necessity
    "يجب": "modal",
    "ينبغي": "modal",
    "لازم": "modal",
    "من الضروري": "modal",
    "مطلوب": "modal",

    # Modal - ability
    "يمكنك": "modal",
    "يمكنني": "modal",
    "يمكننا": "modal",
    "أستطيع": "modal",
    "تستطيع": "modal",
    "نستطيع": "modal",
    "قادر": "modal",
    "قادرة": "modal",

    # Future
    "سيكون": "future",
    "ستكون": "future",
    "سيتم": "future",
    "ستتم": "future",

    # Past
    "كانت": "past",
    "كنت": "past",
    "كنا": "past",
    "كانوا": "past",
    "وكان": "past",

    # Conditional
    "إذا": "condition",
    "إن": "condition",
    "لو": "condition",
    "عندما": "when",
    "حين": "when",
    "متى": "when",
})

# ════════════════════════════════════════════════════════════════════════════════
# 3. ARABIC RELATION WORDS (REL tokens)
# ════════════════════════════════════════════════════════════════════════════════
print("\n── 3. Arabic relation words ─────────────────────────────────────────")
add_rel({
    "بسبب": "REL:causes",
    "نتيجة": "REL:causes",
    "نتيجةً": "REL:causes",
    "لأجل": "REL:for",
    "لكي": "REL:for",
    "بشأن": "REL:about",
    "حول": "REL:about",
    "بخصوص": "REL:about",
    "فيما يتعلق": "REL:about",
    "قبل": "REL:before",
    "بعد": "REL:after",
    "بين": "REL:between",
    "داخل": "REL:in",
    "خارج": "REL:out",
    "أمام": "REL:in",
    "وراء": "REL:in",
    "بجانب": "REL:with",
    "إلى جانب": "REL:with",
    "بالنسبة": "REL:about",
    "وفقاً": "REL:about",
    "وفقا": "REL:about",
    "كما": "REL:and",
    "سواء": "REL:or",
    "أو": "REL:or",
    "أم": "REL:or",
    "والـ": "REL:and",
    "وكذلك": "REL:and",
    "بالإضافة إلى": "REL:and",
    "ضد": "REL:against",
    "أثناء": "REL:during",
    "خلال": "REL:during",
    "حسب": "REL:about",
    "طبقاً": "REL:about",
})

# ════════════════════════════════════════════════════════════════════════════════
# 4. ARABIC COMPOUND BIGRAMS (modern / AI / business)
# ════════════════════════════════════════════════════════════════════════════════
print("\n── 4. Arabic compound bigrams (AI + business) ───────────────────────")
add_compound_ar({
    # AI / ML
    "ذكاء اصطناعي": "tech.ai",
    "الذكاء الاصطناعي": "tech.ai",
    "تعلم آلي": "tech.ai",
    "التعلم الآلي": "tech.ai",
    "تعلم عميق": "tech.ai",
    "التعلم العميق": "tech.ai",
    "شبكة عصبية": "tech.ai",
    "الشبكة العصبية": "tech.ai",
    "نموذج لغوي": "tech.ai",
    "نماذج لغوية": "tech.ai",
    "معالجة لغة": "tech.ai",
    "توليد نص": "tech.ai",
    "رؤية حاسوبية": "tech.ai",
    "وكيل ذكي": "tech.ai",
    "مساعد ذكي": "tech.ai",
    "برنامج حواري": "tech.ai",
    "روبوت محادثة": "tech.ai",
    "روبوت دردشة": "tech.ai",

    # Cloud / tech
    "حوسبة سحابية": "tech.cloud",
    "الحوسبة السحابية": "tech.cloud",
    "خدمات سحابية": "tech.cloud",
    "أمن سيبراني": "tech.security",
    "الأمن السيبراني": "tech.security",
    "أمن معلومات": "tech.security",
    "حماية بيانات": "tech.security",
    "واجهة برمجية": "tech.code",
    "قاعدة بيانات": "tech.data",
    "قواعد البيانات": "tech.data",
    "تحليل بيانات": "tech.data",
    "علم بيانات": "tech.data",
    "علم البيانات": "tech.data",

    # Business
    "خدمة عملاء": "work",
    "رعاية عملاء": "work",
    "دعم العملاء": "work",
    "دعم فني": "tech",
    "خدمة دعم": "work",
    "إدارة علاقات": "work",
    "تجربة مستخدم": "work",
    "واجهة مستخدم": "tech",
    "تحسين محركات": "tech",
    "تجارة إلكترونية": "trade",
    "التجارة الإلكترونية": "trade",
    "بيع بالتجزئة": "trade",
    "سلسلة توريد": "trade",
    "سلسلة الإمداد": "trade",
    "إدارة المخزون": "trade",
    "خطة عمل": "work",
    "خطة أعمال": "work",
    "استراتيجية عمل": "work",
    "إدارة مشاريع": "work",
    "تحليل السوق": "trade",
    "حصة سوقية": "trade",
    "إيرادات المبيعات": "trade",
    "هامش ربح": "trade",
    "مؤشر أداء": "work",
    "عائد الاستثمار": "trade",
    "رأس المال": "trade",
    "تمويل مشروع": "trade",
    "اندماج وشراء": "trade",
    "علامة تجارية": "trade",
    "حقوق ملكية": "trade",

    # Social media
    "وسائل التواصل": "social",
    "تواصل اجتماعي": "social",
    "شبكة اجتماعية": "social",
    "منصة رقمية": "tech",
    "محتوى رقمي": "tech",
    "تسويق رقمي": "trade",
    "إعلان رقمي": "trade",
    "إعلان إلكتروني": "trade",

    # Health
    "صحة نفسية": "health",
    "الصحة النفسية": "health",
    "صحة جسدية": "health",
    "رعاية صحية": "health",
    "الرعاية الصحية": "health",
    "نظام صحي": "health",
    "تأمين صحي": "health",
    "طب نفسي": "health",
    "علاج طبيعي": "health",
    "طوارئ طبية": "health",

    # Education
    "تعليم إلكتروني": "know",
    "التعليم الإلكتروني": "know",
    "تعلم عن بعد": "know",
    "تعليم عن بعد": "know",
    "منصة تعليمية": "know",
    "محتوى تعليمي": "know",
    "ذكاء عاطفي": "know",

    # Finance / trade modern
    "عملة رقمية": "trade.currency",
    "عملة مشفرة": "trade.currency",
    "بلوك تشين": "trade.currency",
    "سوق مالي": "trade",
    "سوق الأسهم": "trade.stock",
    "بورصة الأوراق": "trade.stock",

    # Governance / legal
    "حقوق الإنسان": "govern",
    "تغيير مناخي": "nature",
    "الاحترار العالمي": "nature",
    "طاقة متجددة": "tech",
    "طاقة شمسية": "tech",
})

# ════════════════════════════════════════════════════════════════════════════════
# 5. ARABIC CONTENT WORDS IN CONCEPTS.JSON
# ════════════════════════════════════════════════════════════════════════════════
print("\n── 5. Arabic content words (concepts.json) ──────────────────────────")

# ── person ────────────────────────────────────────────────────────────────────
add_ar_word("person", [
    {"word": "الرجل",   "gloss": "man, male person"},
    {"word": "المرأة",  "gloss": "woman, female person"},
    {"word": "رجل",     "gloss": "man"},
    {"word": "امرأة",   "gloss": "woman"},
    {"word": "ولد",     "gloss": "boy"},
    {"word": "بنت",     "gloss": "girl"},
    {"word": "طفل",     "gloss": "child"},
    {"word": "شاب",     "gloss": "youth, young man"},
    {"word": "شخص",     "gloss": "person, individual"},
    {"word": "الناس",   "gloss": "people"},
    {"word": "الشعب",   "gloss": "the people"},
    {"word": "سيد",     "gloss": "sir, mister"},
    {"word": "سيدي",    "gloss": "sir (formal address)"},
    {"word": "سيدة",    "gloss": "madam, lady"},
    {"word": "أستاذ",   "gloss": "professor, teacher (honorific)"},
    {"word": "دكتور",   "gloss": "doctor (title)"},
    {"word": "صديق",    "gloss": "friend"},
    {"word": "صاحب",    "gloss": "companion, friend"},
    {"word": "زوج",     "gloss": "husband, spouse"},
    {"word": "زوجة",    "gloss": "wife"},
    {"word": "أب",      "gloss": "father"},
    {"word": "أم",      "gloss": "mother"},
    {"word": "ابن",     "gloss": "son"},
    {"word": "ابنة",    "gloss": "daughter"},
    {"word": "أخ",      "gloss": "brother"},
    {"word": "أخت",     "gloss": "sister"},
    {"word": "عميل",    "gloss": "customer, client"},
    {"word": "مستخدم",  "gloss": "user"},
    {"word": "مستخدمة", "gloss": "user (feminine)"},
    {"word": "زبون",    "gloss": "customer, client (colloquial)"},
    {"word": "موظف",    "gloss": "employee"},
    {"word": "موظفة",   "gloss": "employee (feminine)"},
    {"word": "مدير",    "gloss": "manager, director"},
    {"word": "مديرة",   "gloss": "director (feminine)"},
])

# ── exist ─────────────────────────────────────────────────────────────────────
add_ar_word("exist", [
    {"word": "العالم",  "gloss": "the world"},
    {"word": "عالم",    "gloss": "world, universe"},
    {"word": "الواقع",  "gloss": "reality, the real world"},
    {"word": "واقع",    "gloss": "reality"},
    {"word": "الحياة",  "gloss": "life"},
    {"word": "حياة",    "gloss": "life, existence"},
    {"word": "الوجود",  "gloss": "existence, being"},
    {"word": "الطبيعة", "gloss": "nature"},
])

# ── know ──────────────────────────────────────────────────────────────────────
add_ar_word("know", [
    {"word": "الحقيقة", "gloss": "the truth"},
    {"word": "حقيقة",   "gloss": "truth, reality"},
    {"word": "معلومة",  "gloss": "piece of information"},
    {"word": "معلومات", "gloss": "information"},
    {"word": "بيانات",  "gloss": "data"},
    {"word": "معنى",    "gloss": "meaning"},
    {"word": "المعنى",  "gloss": "the meaning"},
    {"word": "مفهوم",   "gloss": "concept, notion"},
    {"word": "فكرة",    "gloss": "idea"},
    {"word": "تعريف",   "gloss": "definition"},
    {"word": "شرح",     "gloss": "explanation"},
    {"word": "تفسير",   "gloss": "interpretation, explanation"},
    {"word": "فهم",     "gloss": "understanding"},
    {"word": "علم",     "gloss": "knowledge, science"},
    {"word": "ذكاء",    "gloss": "intelligence"},
    {"word": "تعليم",   "gloss": "education"},
    {"word": "دراسة",   "gloss": "study"},
    {"word": "بحث",     "gloss": "research"},
    {"word": "اكتشاف",  "gloss": "discovery"},
    {"word": "إجابة",   "gloss": "answer, response"},
    {"word": "سؤال",    "gloss": "question"},
    {"word": "موضوع",   "gloss": "topic, subject"},
])

# ── work ──────────────────────────────────────────────────────────────────────
add_ar_word("work", [
    {"word": "العمل",   "gloss": "work, job"},
    {"word": "عمل",     "gloss": "work, action"},
    {"word": "مهنة",    "gloss": "profession"},
    {"word": "وظيفة",   "gloss": "job, position"},
    {"word": "مشروع",   "gloss": "project"},
    {"word": "خطة",     "gloss": "plan"},
    {"word": "هدف",     "gloss": "goal, target"},
    {"word": "مهمة",    "gloss": "task, mission"},
    {"word": "نتيجة",   "gloss": "result, outcome"},
    {"word": "نجاح",    "gloss": "success"},
    {"word": "فشل",     "gloss": "failure"},
    {"word": "تحسين",   "gloss": "improvement"},
    {"word": "تطوير",   "gloss": "development"},
    {"word": "تحديث",   "gloss": "update, modernization"},
    {"word": "استراتيجية", "gloss": "strategy"},
    {"word": "إدارة",   "gloss": "management"},
    {"word": "تنظيم",   "gloss": "organization"},
    {"word": "اجتماع",  "gloss": "meeting"},
    {"word": "فريق",    "gloss": "team"},
    {"word": "شركة",    "gloss": "company"},
    {"word": "مؤسسة",   "gloss": "institution, organization"},
    {"word": "منظمة",   "gloss": "organization"},
    {"word": "مكتب",    "gloss": "office"},
    {"word": "دور",     "gloss": "role"},
    {"word": "مسؤولية", "gloss": "responsibility"},
    {"word": "تقرير",   "gloss": "report"},
    {"word": "خدمة",    "gloss": "service"},
    {"word": "دعم",     "gloss": "support"},
    {"word": "مساعدة",  "gloss": "help, assistance"},
])

# ── trade ─────────────────────────────────────────────────────────────────────
add_ar_word("trade", [
    {"word": "مال",     "gloss": "money"},
    {"word": "مالية",   "gloss": "financial, finances"},
    {"word": "مبلغ",    "gloss": "amount, sum of money"},
    {"word": "ثمن",     "gloss": "price, cost"},
    {"word": "سعر",     "gloss": "price"},
    {"word": "تكلفة",   "gloss": "cost"},
    {"word": "ميزانية", "gloss": "budget"},
    {"word": "ربح",     "gloss": "profit"},
    {"word": "خسارة",   "gloss": "loss"},
    {"word": "دخل",     "gloss": "income"},
    {"word": "إيراد",   "gloss": "revenue"},
    {"word": "مبيعات",  "gloss": "sales"},
    {"word": "تسويق",   "gloss": "marketing"},
    {"word": "إعلان",   "gloss": "advertisement"},
    {"word": "عرض",     "gloss": "offer, proposal"},
    {"word": "صفقة",    "gloss": "deal, transaction"},
    {"word": "عقد",     "gloss": "contract"},
    {"word": "فاتورة",  "gloss": "invoice, bill"},
    {"word": "ضريبة",   "gloss": "tax"},
    {"word": "رسوم",    "gloss": "fees"},
    {"word": "استثمار", "gloss": "investment"},
    {"word": "سوق",     "gloss": "market"},
    {"word": "منتج",    "gloss": "product"},
    {"word": "بضاعة",   "gloss": "goods, merchandise"},
    {"word": "شراء",    "gloss": "purchase, buying"},
    {"word": "بيع",     "gloss": "sale, selling"},
    {"word": "طلب",     "gloss": "order, request"},
    {"word": "توصيل",   "gloss": "delivery"},
    {"word": "شحن",     "gloss": "shipping"},
    {"word": "استرداد", "gloss": "refund"},
    {"word": "ضمان",    "gloss": "warranty, guarantee"},
    {"word": "اشتراك",  "gloss": "subscription"},
    {"word": "عمولة",   "gloss": "commission"},
    {"word": "خصم",     "gloss": "discount"},
    {"word": "ائتمان",  "gloss": "credit"},
    {"word": "تمويل",   "gloss": "financing"},
    {"word": "قرض",     "gloss": "loan"},
    {"word": "ديون",    "gloss": "debts"},
])

# ── tech ──────────────────────────────────────────────────────────────────────
add_ar_word("tech", [
    {"word": "تقنية",   "gloss": "technology"},
    {"word": "تكنولوجيا","gloss": "technology"},
    {"word": "برنامج",  "gloss": "software, program"},
    {"word": "تطبيق",   "gloss": "application, app"},
    {"word": "موقع",    "gloss": "website"},
    {"word": "نظام",    "gloss": "system"},
    {"word": "منصة",    "gloss": "platform"},
    {"word": "جهاز",    "gloss": "device"},
    {"word": "شبكة",    "gloss": "network"},
    {"word": "انترنت",  "gloss": "internet"},
    {"word": "إنترنت",  "gloss": "internet"},
    {"word": "رقمي",    "gloss": "digital"},
    {"word": "رقمية",   "gloss": "digital (f)"},
    {"word": "إلكتروني","gloss": "electronic"},
    {"word": "إلكترونية","gloss": "electronic (f)"},
    {"word": "خوارزمية","gloss": "algorithm"},
    {"word": "بيانات",  "gloss": "data"},
    {"word": "قاعدة",   "gloss": "database, base"},
    {"word": "واجهة",   "gloss": "interface"},
    {"word": "أمان",    "gloss": "security"},
    {"word": "حماية",   "gloss": "protection"},
    {"word": "تشفير",   "gloss": "encryption"},
    {"word": "رمز",     "gloss": "code, symbol"},
    {"word": "كود",     "gloss": "code (loanword)"},
    {"word": "برمجة",   "gloss": "programming"},
    {"word": "تطوير",   "gloss": "development"},
    {"word": "إطار",    "gloss": "framework"},
    {"word": "خادم",    "gloss": "server"},
    {"word": "سحابة",   "gloss": "cloud"},
    {"word": "روبوت",   "gloss": "robot"},
    {"word": "حاسوب",   "gloss": "computer"},
    {"word": "حاسب",    "gloss": "computer"},
    {"word": "معالج",   "gloss": "processor"},
    {"word": "ذاكرة",   "gloss": "memory, storage"},
    {"word": "تخزين",   "gloss": "storage"},
    {"word": "تحديث",   "gloss": "update"},
    {"word": "نسخة",    "gloss": "version"},
    {"word": "إصدار",   "gloss": "release, version"},
    {"word": "تثبيت",   "gloss": "installation"},
    {"word": "ترقية",   "gloss": "upgrade"},
    {"word": "اتصال",   "gloss": "connection"},
    {"word": "لاسلكي",  "gloss": "wireless"},
    {"word": "بلوتوث",  "gloss": "bluetooth"},
    {"word": "واي فاي", "gloss": "wifi"},
    {"word": "بيكسل",   "gloss": "pixel"},
    {"word": "دقة",     "gloss": "resolution, precision"},
    {"word": "رفع",     "gloss": "upload"},
    {"word": "تنزيل",   "gloss": "download"},
    {"word": "رفع السرعة", "gloss": "speed boost"},
])

# ── tech.ai ───────────────────────────────────────────────────────────────────
add_ar_word("tech.ai", [
    {"word": "ذكاء",      "gloss": "intelligence (AI context)"},
    {"word": "اصطناعي",   "gloss": "artificial"},
    {"word": "نموذج",     "gloss": "model (AI)"},
    {"word": "خوارزمية",  "gloss": "algorithm"},
    {"word": "تدريب",     "gloss": "training (AI)"},
    {"word": "توليد",     "gloss": "generation (AI)"},
    {"word": "تحليل",     "gloss": "analysis"},
    {"word": "تصنيف",     "gloss": "classification"},
    {"word": "توقع",      "gloss": "prediction"},
    {"word": "مساعد",     "gloss": "assistant (AI)"},
    {"word": "وكيل",      "gloss": "agent (AI)"},
    {"word": "محادثة",    "gloss": "conversation, chat"},
    {"word": "دردشة",     "gloss": "chat"},
    {"word": "بوت",       "gloss": "bot"},
    {"word": "شات بوت",   "gloss": "chatbot"},
    {"word": "برومبت",    "gloss": "prompt"},
    {"word": "استجابة",   "gloss": "response, output"},
    {"word": "توصية",     "gloss": "recommendation"},
    {"word": "أتمتة",     "gloss": "automation"},
    {"word": "مؤتمت",     "gloss": "automated"},
    {"word": "سير عمل",   "gloss": "workflow"},
    {"word": "معالجة",    "gloss": "processing"},
    {"word": "تضمين",     "gloss": "embedding"},
    {"word": "انتباه",    "gloss": "attention (AI mechanism)"},
    {"word": "محول",      "gloss": "transformer (AI)"},
    {"word": "ضبط",       "gloss": "fine-tuning"},
    {"word": "استدلال",   "gloss": "inference"},
    {"word": "دقة",       "gloss": "accuracy, precision"},
    {"word": "أداء",      "gloss": "performance"},
    {"word": "تحسين",     "gloss": "optimization"},
    {"word": "تقييم",     "gloss": "evaluation"},
    {"word": "اختبار",    "gloss": "testing"},
    {"word": "نشر",       "gloss": "deployment"},
    {"word": "إنتاج",     "gloss": "production"},
    {"word": "سياق",      "gloss": "context"},
    {"word": "هلوسة",     "gloss": "hallucination (AI)"},
    {"word": "تحيز",      "gloss": "bias (AI)"},
    {"word": "شفافية",    "gloss": "transparency (AI)"},
    {"word": "قابلية تفسير", "gloss": "explainability"},
    {"word": "أخلاقيات",  "gloss": "ethics (AI ethics)"},
])

# ── health ────────────────────────────────────────────────────────────────────
add_ar_word("health", [
    {"word": "صحة",     "gloss": "health"},
    {"word": "مرض",     "gloss": "disease, illness"},
    {"word": "علاج",    "gloss": "treatment"},
    {"word": "دواء",    "gloss": "medicine"},
    {"word": "دكتور",   "gloss": "doctor"},
    {"word": "طبيب",    "gloss": "physician"},
    {"word": "مستشفى",  "gloss": "hospital"},
    {"word": "عيادة",   "gloss": "clinic"},
    {"word": "ألم",     "gloss": "pain"},
    {"word": "أعراض",   "gloss": "symptoms"},
    {"word": "عرض",     "gloss": "symptom"},
    {"word": "تشخيص",   "gloss": "diagnosis"},
    {"word": "عملية",   "gloss": "surgery, operation"},
    {"word": "جراحة",   "gloss": "surgery"},
    {"word": "تمريض",   "gloss": "nursing"},
    {"word": "صيدلية",  "gloss": "pharmacy"},
    {"word": "طوارئ",   "gloss": "emergency"},
    {"word": "إسعاف",   "gloss": "ambulance"},
    {"word": "تأمين",   "gloss": "insurance"},
    {"word": "وصفة",    "gloss": "prescription"},
    {"word": "فيتامين", "gloss": "vitamin"},
    {"word": "لقاح",    "gloss": "vaccine"},
    {"word": "وباء",    "gloss": "epidemic, pandemic"},
    {"word": "نظافة",   "gloss": "hygiene, cleanliness"},
])

# ── place ─────────────────────────────────────────────────────────────────────
add_ar_word("place", [
    {"word": "منزل",    "gloss": "home, house"},
    {"word": "المنزل",  "gloss": "the home"},
    {"word": "بيت",     "gloss": "house"},
    {"word": "مكان",    "gloss": "place, location"},
    {"word": "منطقة",   "gloss": "area, region"},
    {"word": "مدينة",   "gloss": "city"},
    {"word": "قرية",    "gloss": "village"},
    {"word": "شارع",    "gloss": "street"},
    {"word": "طريق",    "gloss": "road, way"},
    {"word": "مطار",    "gloss": "airport"},
    {"word": "محطة",    "gloss": "station"},
    {"word": "مطعم",    "gloss": "restaurant"},
    {"word": "فندق",    "gloss": "hotel"},
    {"word": "سوق",     "gloss": "market, bazaar"},
    {"word": "مدرسة",   "gloss": "school"},
    {"word": "جامعة",   "gloss": "university"},
    {"word": "مسجد",    "gloss": "mosque"},
    {"word": "كنيسة",   "gloss": "church"},
    {"word": "متحف",    "gloss": "museum"},
    {"word": "مستشفى",  "gloss": "hospital"},
    {"word": "مركز",    "gloss": "center"},
    {"word": "محل",     "gloss": "shop, store"},
    {"word": "صيدلية",  "gloss": "pharmacy"},
    {"word": "بنك",     "gloss": "bank"},
    {"word": "مكتبة",   "gloss": "library"},
    {"word": "حديقة",   "gloss": "garden, park"},
    {"word": "ميدان",   "gloss": "square, plaza"},
    {"word": "عنوان",   "gloss": "address"},
])

# ── social ────────────────────────────────────────────────────────────────────
add_ar_word("social", [
    {"word": "مجتمع",   "gloss": "society, community"},
    {"word": "جماعة",   "gloss": "group, community"},
    {"word": "حفلة",    "gloss": "party, celebration"},
    {"word": "عيد",     "gloss": "holiday, celebration"},
    {"word": "زواج",    "gloss": "marriage"},
    {"word": "عائلة",   "gloss": "family"},
    {"word": "ثقافة",   "gloss": "culture"},
    {"word": "تقاليد",  "gloss": "traditions"},
    {"word": "عادات",   "gloss": "customs"},
    {"word": "هدية",    "gloss": "gift"},
    {"word": "شبكة",    "gloss": "network, social network"},
])

# ── speak ─────────────────────────────────────────────────────────────────────
add_ar_word("speak", [
    {"word": "لغة",     "gloss": "language"},
    {"word": "اللغة",   "gloss": "the language"},
    {"word": "عربي",    "gloss": "Arabic"},
    {"word": "عربية",   "gloss": "Arabic (f)"},
    {"word": "إنجليزي", "gloss": "English"},
    {"word": "إنجليزية","gloss": "English (f)"},
    {"word": "فرنسي",   "gloss": "French"},
    {"word": "فرنسية",  "gloss": "French (f)"},
    {"word": "ألماني",  "gloss": "German"},
    {"word": "ألمانية", "gloss": "German (f)"},
    {"word": "إسباني",  "gloss": "Spanish"},
    {"word": "إسبانية", "gloss": "Spanish (f)"},
    {"word": "صينية",   "gloss": "Chinese"},
    {"word": "يابانية", "gloss": "Japanese"},
    {"word": "روسي",    "gloss": "Russian"},
    {"word": "روسية",   "gloss": "Russian (f)"},
    {"word": "تركي",    "gloss": "Turkish"},
    {"word": "تركية",   "gloss": "Turkish (f)"},
    {"word": "فارسي",   "gloss": "Persian"},
    {"word": "فارسية",  "gloss": "Persian (f)"},
    {"word": "ترجمة",   "gloss": "translation"},
    {"word": "تواصل",   "gloss": "communication"},
    {"word": "رسالة",   "gloss": "message"},
    {"word": "كلمة",    "gloss": "word"},
    {"word": "جملة",    "gloss": "sentence"},
    {"word": "نص",      "gloss": "text"},
    {"word": "محادثة",  "gloss": "conversation"},
])

# ── time ──────────────────────────────────────────────────────────────────────
add_ar_word("time", [
    {"word": "وقت",     "gloss": "time"},
    {"word": "الوقت",   "gloss": "the time"},
    {"word": "يوم",     "gloss": "day"},
    {"word": "أسبوع",   "gloss": "week"},
    {"word": "شهر",     "gloss": "month"},
    {"word": "سنة",     "gloss": "year"},
    {"word": "عام",     "gloss": "year"},
    {"word": "لحظة",    "gloss": "moment"},
    {"word": "فترة",    "gloss": "period"},
    {"word": "مدة",     "gloss": "duration"},
    {"word": "ساعة",    "gloss": "hour"},
    {"word": "دقيقة",   "gloss": "minute"},
    {"word": "ثانية",   "gloss": "second"},
    {"word": "صباح",    "gloss": "morning"},
    {"word": "مساء",    "gloss": "evening"},
    {"word": "ليل",     "gloss": "night"},
    {"word": "ليلة",    "gloss": "night (occasion)"},
    {"word": "الليلة",  "gloss": "tonight"},
    {"word": "نهار",    "gloss": "daytime"},
    {"word": "غد",      "gloss": "tomorrow"},
    {"word": "أمس",     "gloss": "yesterday"},
    {"word": "تاريخ",   "gloss": "date, history"},
    {"word": "موعد",    "gloss": "appointment"},
    {"word": "جدول",    "gloss": "schedule"},
    {"word": "بكرة",    "gloss": "tomorrow (colloquial)"},
])

# ── move ──────────────────────────────────────────────────────────────────────
add_ar_word("move", [
    {"word": "سفر",     "gloss": "travel"},
    {"word": "رحلة",    "gloss": "trip, journey"},
    {"word": "طيران",   "gloss": "flight, aviation"},
    {"word": "قطار",    "gloss": "train"},
    {"word": "حافلة",   "gloss": "bus"},
    {"word": "سيارة",   "gloss": "car"},
    {"word": "تاكسي",   "gloss": "taxi"},
    {"word": "مطار",    "gloss": "airport"},
    {"word": "سفارة",   "gloss": "embassy"},
    {"word": "جواز",    "gloss": "passport"},
    {"word": "تأشيرة",  "gloss": "visa"},
    {"word": "حجز",     "gloss": "reservation, booking"},
    {"word": "وجهة",    "gloss": "destination"},
    {"word": "مسافة",   "gloss": "distance"},
])

# ── food ──────────────────────────────────────────────────────────────────────
add_ar_word("food", [
    {"word": "طعام",    "gloss": "food"},
    {"word": "أكل",     "gloss": "food, eating"},
    {"word": "وجبة",    "gloss": "meal"},
    {"word": "مطبخ",    "gloss": "kitchen, cuisine"},
    {"word": "ماء",     "gloss": "water"},
    {"word": "شاي",     "gloss": "tea"},
    {"word": "قهوة",    "gloss": "coffee"},
    {"word": "خبز",     "gloss": "bread"},
    {"word": "أرز",     "gloss": "rice"},
    {"word": "لحم",     "gloss": "meat"},
    {"word": "دجاج",    "gloss": "chicken"},
    {"word": "سمك",     "gloss": "fish"},
    {"word": "خضار",    "gloss": "vegetables"},
    {"word": "فاكهة",   "gloss": "fruit"},
    {"word": "حلوى",    "gloss": "sweets, candy"},
    {"word": "وصفة",    "gloss": "recipe"},
])

# ── govern ────────────────────────────────────────────────────────────────────
add_ar_word("govern", [
    {"word": "حكومة",   "gloss": "government"},
    {"word": "سياسة",   "gloss": "politics, policy"},
    {"word": "قانون",   "gloss": "law"},
    {"word": "قاضي",    "gloss": "judge"},
    {"word": "محكمة",   "gloss": "court"},
    {"word": "عدالة",   "gloss": "justice"},
    {"word": "انتخاب",  "gloss": "election"},
    {"word": "مواطن",   "gloss": "citizen"},
    {"word": "حقوق",    "gloss": "rights"},
    {"word": "رئيس",    "gloss": "president, chairman"},
    {"word": "وزير",    "gloss": "minister"},
    {"word": "برلمان",  "gloss": "parliament"},
    {"word": "جيش",     "gloss": "army"},
    {"word": "شرطة",    "gloss": "police"},
    {"word": "أمن",     "gloss": "security, safety"},
    {"word": "سفارة",   "gloss": "embassy"},
    {"word": "دولة",    "gloss": "state, country"},
    {"word": "وزارة",   "gloss": "ministry"},
    {"word": "إدارة",   "gloss": "administration"},
])

# ── nature ────────────────────────────────────────────────────────────────────
add_ar_word("nature", [
    {"word": "طبيعة",   "gloss": "nature"},
    {"word": "بيئة",    "gloss": "environment"},
    {"word": "مناخ",    "gloss": "climate"},
    {"word": "طقس",     "gloss": "weather"},
    {"word": "أرض",     "gloss": "earth, land"},
    {"word": "بحر",     "gloss": "sea"},
    {"word": "نهر",     "gloss": "river"},
    {"word": "جبل",     "gloss": "mountain"},
    {"word": "شجرة",    "gloss": "tree"},
    {"word": "غابة",    "gloss": "forest"},
    {"word": "صحراء",   "gloss": "desert"},
    {"word": "مطر",     "gloss": "rain"},
    {"word": "شمس",     "gloss": "sun"},
    {"word": "قمر",     "gloss": "moon"},
    {"word": "نجم",     "gloss": "star"},
    {"word": "طاقة",    "gloss": "energy"},
    {"word": "كهرباء",  "gloss": "electricity"},
])

# ── art ───────────────────────────────────────────────────────────────────────
add_ar_word("art", [
    {"word": "فن",      "gloss": "art"},
    {"word": "موسيقى",  "gloss": "music"},
    {"word": "أغنية",   "gloss": "song"},
    {"word": "فيلم",    "gloss": "film, movie"},
    {"word": "مسلسل",   "gloss": "TV series"},
    {"word": "برنامج",  "gloss": "program, show"},
    {"word": "رواية",   "gloss": "novel"},
    {"word": "قصة",     "gloss": "story"},
    {"word": "شعر",     "gloss": "poetry"},
    {"word": "رسم",     "gloss": "drawing, painting"},
    {"word": "مسرح",    "gloss": "theater"},
    {"word": "تصوير",   "gloss": "photography"},
    {"word": "صورة",    "gloss": "picture, image"},
    {"word": "ألوان",   "gloss": "colors"},
    {"word": "كتاب",    "gloss": "book"},
])

# ── quality ───────────────────────────────────────────────────────────────────
add_ar_word("quality", [
    {"word": "جيد",     "gloss": "good"},
    {"word": "جيدة",    "gloss": "good (f)"},
    {"word": "سيء",     "gloss": "bad"},
    {"word": "كبير",    "gloss": "big, large"},
    {"word": "صغير",    "gloss": "small"},
    {"word": "جديد",    "gloss": "new"},
    {"word": "قديم",    "gloss": "old"},
    {"word": "سريع",    "gloss": "fast, quick"},
    {"word": "بطيء",    "gloss": "slow"},
    {"word": "مهم",     "gloss": "important"},
    {"word": "سهل",     "gloss": "easy"},
    {"word": "صعب",     "gloss": "difficult"},
    {"word": "ممتاز",   "gloss": "excellent"},
    {"word": "مشكلة",   "gloss": "problem"},
    {"word": "أزمة",    "gloss": "crisis"},
    {"word": "نوع",     "gloss": "type, kind"},
    {"word": "مستوى",   "gloss": "level"},
    {"word": "درجة",    "gloss": "degree, grade"},
])

# ════════════════════════════════════════════════════════════════════════════════
# 6. MODERN AI / TECH / BUSINESS ENGLISH VOCAB (new era vocabulary)
# ════════════════════════════════════════════════════════════════════════════════
print("\n── 6. Modern AI/tech/business English vocab ─────────────────────────")

add_en("tech.ai", [
    {"stem": "ai",           "gloss": "AI, artificial intelligence"},
    {"stem": "llm",          "gloss": "LLM, large language model"},
    {"stem": "gpt",          "gloss": "GPT, generative pre-trained transformer"},
    {"stem": "chatgpt",      "gloss": "ChatGPT, OpenAI language model"},
    {"stem": "gemini",       "gloss": "Gemini, Google AI model"},
    {"stem": "claude",       "gloss": "Claude, Anthropic AI model"},
    {"stem": "copilot",      "gloss": "Copilot, AI assistant"},
    {"stem": "prompt",       "gloss": "prompt, instruction given to an AI"},
    {"stem": "inference",    "gloss": "inference, AI model output generation"},
    {"stem": "embedding",    "gloss": "embedding, vector representation of text"},
    {"stem": "rag",          "gloss": "RAG, retrieval-augmented generation"},
    {"stem": "retrieval",    "gloss": "retrieval, fetching relevant information"},
    {"stem": "finetuning",   "gloss": "fine-tuning, adapting a model on data"},
    {"stem": "finetune",     "gloss": "fine-tune, adapt AI model on specific data"},
    {"stem": "hallucination","gloss": "hallucination, AI generating false info"},
    {"stem": "tokenize",     "gloss": "tokenize, split text into tokens"},
    {"stem": "tokenizer",    "gloss": "tokenizer, tool that splits text into tokens"},
    {"stem": "token",        "gloss": "token, unit of text for AI processing"},
    {"stem": "context",      "gloss": "context, surrounding information for AI"},
    {"stem": "vector",       "gloss": "vector, mathematical array of numbers"},
    {"stem": "semantic",     "gloss": "semantic, relating to meaning"},
    {"stem": "neural",       "gloss": "neural, relating to neural networks"},
    {"stem": "transformer",  "gloss": "transformer, neural network architecture"},
    {"stem": "attention",    "gloss": "attention, mechanism in transformer models"},
    {"stem": "diffusion",    "gloss": "diffusion, generative AI technique"},
    {"stem": "generative",   "gloss": "generative, AI that creates new content"},
    {"stem": "multimodal",   "gloss": "multimodal, handling text, image, audio"},
    {"stem": "benchmark",    "gloss": "benchmark, standard test for AI systems"},
    {"stem": "evaluate",     "gloss": "evaluate, assess AI system performance"},
    {"stem": "evaluation",   "gloss": "evaluation, assessment of AI performance"},
    {"stem": "bias",         "gloss": "bias, systematic error in AI"},
    {"stem": "fairness",     "gloss": "fairness, equitable AI treatment"},
    {"stem": "alignment",    "gloss": "alignment, ensuring AI follows human values"},
    {"stem": "safety",       "gloss": "safety, preventing AI harm"},
    {"stem": "explainability","gloss": "explainability, ability to interpret AI"},
    {"stem": "agent",        "gloss": "agent, AI that acts autonomously"},
    {"stem": "workflow",     "gloss": "workflow, sequence of automated steps"},
    {"stem": "pipeline",     "gloss": "pipeline, sequence of processing steps"},
    {"stem": "orchestration","gloss": "orchestration, coordinating AI components"},
    {"stem": "agentic",      "gloss": "agentic, relating to autonomous AI agents"},
    {"stem": "copilot",      "gloss": "copilot, AI assistant tool"},
])

add_en("tech", [
    {"stem": "api",          "gloss": "API, application programming interface"},
    {"stem": "sdk",          "gloss": "SDK, software development kit"},
    {"stem": "saas",         "gloss": "SaaS, software as a service"},
    {"stem": "paas",         "gloss": "PaaS, platform as a service"},
    {"stem": "iaas",         "gloss": "IaaS, infrastructure as a service"},
    {"stem": "devops",       "gloss": "DevOps, development and operations"},
    {"stem": "cicd",         "gloss": "CI/CD, continuous integration and deployment"},
    {"stem": "microservice", "gloss": "microservice, small independent service"},
    {"stem": "serverless",   "gloss": "serverless, cloud compute without server mgmt"},
    {"stem": "container",    "gloss": "container, isolated software environment"},
    {"stem": "docker",       "gloss": "Docker, containerization platform"},
    {"stem": "kubernetes",   "gloss": "Kubernetes, container orchestration"},
    {"stem": "deployment",   "gloss": "deployment, releasing software to production"},
    {"stem": "repository",   "gloss": "repository, storage for code versions"},
    {"stem": "webhook",      "gloss": "webhook, HTTP callback trigger"},
    {"stem": "middleware",   "gloss": "middleware, software connecting components"},
    {"stem": "runtime",      "gloss": "runtime, environment where code executes"},
    {"stem": "endpoint",     "gloss": "endpoint, URL for an API request"},
    {"stem": "payload",      "gloss": "payload, data sent in a request"},
    {"stem": "authentication","gloss": "authentication, verifying user identity"},
    {"stem": "authorization","gloss": "authorization, granting access permissions"},
    {"stem": "encryption",   "gloss": "encryption, encoding data for security"},
    {"stem": "latency",      "gloss": "latency, delay in data transmission"},
    {"stem": "throughput",   "gloss": "throughput, amount processed per unit time"},
    {"stem": "scalability",  "gloss": "scalability, ability to handle growth"},
    {"stem": "reliability",  "gloss": "reliability, consistent correct functioning"},
    {"stem": "uptime",       "gloss": "uptime, time system is operational"},
    {"stem": "downtime",     "gloss": "downtime, time system is unavailable"},
    {"stem": "log",          "gloss": "log, record of system events"},
    {"stem": "monitoring",   "gloss": "monitoring, tracking system performance"},
    {"stem": "dashboard",    "gloss": "dashboard, visual data overview"},
    {"stem": "notification",  "gloss": "notification, alert to user"},
    {"stem": "widget",       "gloss": "widget, UI component element"},
    {"stem": "template",     "gloss": "template, reusable design pattern"},
    {"stem": "schema",       "gloss": "schema, structure definition for data"},
    {"stem": "migration",    "gloss": "migration, moving data or code to new system"},
    {"stem": "backup",       "gloss": "backup, copy of data for recovery"},
    {"stem": "cache",        "gloss": "cache, temporary fast-access storage"},
    {"stem": "queue",        "gloss": "queue, ordered list for processing"},
    {"stem": "batch",        "gloss": "batch, group of items processed together"},
    {"stem": "automation",   "gloss": "automation, performing tasks automatically"},
    {"stem": "integration",  "gloss": "integration, connecting systems together"},
    {"stem": "compatibility","gloss": "compatibility, ability to work together"},
    {"stem": "plugin",       "gloss": "plugin, software extension"},
    {"stem": "extension",    "gloss": "extension, add-on to software"},
    {"stem": "framework",    "gloss": "framework, reusable software structure"},
    {"stem": "library",      "gloss": "library, collection of reusable code"},
    {"stem": "package",      "gloss": "package, bundled software module"},
    {"stem": "dependency",   "gloss": "dependency, required software component"},
    {"stem": "open-source",  "gloss": "open-source, freely available source code"},
])

add_en("tech.cloud", [
    {"stem": "cloud",        "gloss": "cloud, remote computing infrastructure"},
    {"stem": "aws",          "gloss": "AWS, Amazon Web Services"},
    {"stem": "azure",        "gloss": "Azure, Microsoft cloud platform"},
    {"stem": "gcp",          "gloss": "GCP, Google Cloud Platform"},
    {"stem": "hosting",      "gloss": "hosting, providing server space for apps"},
    {"stem": "storage",      "gloss": "storage, place to keep data"},
    {"stem": "compute",      "gloss": "compute, processing power in the cloud"},
    {"stem": "instance",     "gloss": "instance, single running cloud server"},
    {"stem": "region",       "gloss": "region, geographic location of data centers"},
    {"stem": "cluster",      "gloss": "cluster, group of servers working together"},
    {"stem": "replica",      "gloss": "replica, copy for redundancy"},
    {"stem": "cdn",          "gloss": "CDN, content delivery network"},
    {"stem": "bandwidth",    "gloss": "bandwidth, data transfer capacity"},
])

add_en("tech.data", [
    {"stem": "dataset",      "gloss": "dataset, collection of structured data"},
    {"stem": "database",     "gloss": "database, organized data storage"},
    {"stem": "sql",          "gloss": "SQL, structured query language"},
    {"stem": "nosql",        "gloss": "NoSQL, non-relational database"},
    {"stem": "query",        "gloss": "query, request for specific data"},
    {"stem": "record",       "gloss": "record, single entry in a database"},
    {"stem": "pipeline",     "gloss": "pipeline, data processing flow"},
    {"stem": "etl",          "gloss": "ETL, extract transform load data process"},
    {"stem": "analytics",    "gloss": "analytics, analysis of data for insight"},
    {"stem": "metric",       "gloss": "metric, measurable indicator of performance"},
    {"stem": "insight",      "gloss": "insight, understanding derived from data"},
    {"stem": "visualization","gloss": "visualization, graphical display of data"},
    {"stem": "spreadsheet",  "gloss": "spreadsheet, grid for data organization"},
    {"stem": "csv",          "gloss": "CSV, comma-separated values file format"},
    {"stem": "json",         "gloss": "JSON, data interchange format"},
    {"stem": "xml",          "gloss": "XML, markup data format"},
    {"stem": "annotation",   "gloss": "annotation, labeling data for training"},
    {"stem": "labeling",     "gloss": "labeling, marking data with categories"},
])

# ── work / business ───────────────────────────────────────────────────────────
add_en("work", [
    {"stem": "startup",      "gloss": "startup, new entrepreneurial company"},
    {"stem": "entrepreneur", "gloss": "entrepreneur, person who starts businesses"},
    {"stem": "founder",      "gloss": "founder, person who establishes a company"},
    {"stem": "ceo",          "gloss": "CEO, chief executive officer"},
    {"stem": "cto",          "gloss": "CTO, chief technology officer"},
    {"stem": "cfo",          "gloss": "CFO, chief financial officer"},
    {"stem": "stakeholder",  "gloss": "stakeholder, person with interest in project"},
    {"stem": "vendor",       "gloss": "vendor, supplier of goods or services"},
    {"stem": "partnership",  "gloss": "partnership, cooperative business relationship"},
    {"stem": "outsource",    "gloss": "outsource, hire external party for work"},
    {"stem": "deadline",     "gloss": "deadline, latest time for completion"},
    {"stem": "milestone",    "gloss": "milestone, significant point in project"},
    {"stem": "deliverable",  "gloss": "deliverable, output item of a project"},
    {"stem": "sprint",       "gloss": "sprint, short agile development cycle"},
    {"stem": "agile",        "gloss": "agile, iterative software development method"},
    {"stem": "scrum",        "gloss": "scrum, agile framework for project management"},
    {"stem": "kanban",       "gloss": "kanban, visual workflow management system"},
    {"stem": "roadmap",      "gloss": "roadmap, plan of future product development"},
    {"stem": "backlog",      "gloss": "backlog, list of pending work items"},
    {"stem": "feedback",     "gloss": "feedback, response to product or work"},
    {"stem": "onboarding",   "gloss": "onboarding, process of integrating new users"},
    {"stem": "offboarding",  "gloss": "offboarding, process of departing employees"},
    {"stem": "workflow",     "gloss": "workflow, sequence of work steps"},
    {"stem": "approval",     "gloss": "approval, formal acceptance of something"},
    {"stem": "compliance",   "gloss": "compliance, following rules and regulations"},
    {"stem": "audit",        "gloss": "audit, official inspection of records"},
    {"stem": "kpi",          "gloss": "KPI, key performance indicator"},
    {"stem": "okr",          "gloss": "OKR, objectives and key results"},
    {"stem": "roi",          "gloss": "ROI, return on investment"},
    {"stem": "sla",          "gloss": "SLA, service level agreement"},
    {"stem": "contract",     "gloss": "contract, legally binding agreement"},
    {"stem": "invoice",      "gloss": "invoice, bill for goods or services"},
    {"stem": "quote",        "gloss": "quote, estimated price for a job"},
    {"stem": "pitch",        "gloss": "pitch, presentation to potential investors"},
    {"stem": "valuation",    "gloss": "valuation, estimated worth of a company"},
    {"stem": "equity",       "gloss": "equity, ownership share in a company"},
    {"stem": "venture",      "gloss": "venture, risky business enterprise"},
    {"stem": "acquisition",  "gloss": "acquisition, buying another company"},
    {"stem": "merger",       "gloss": "merger, combining two companies into one"},
    {"stem": "subsidiary",   "gloss": "subsidiary, company owned by another"},
    {"stem": "franchise",    "gloss": "franchise, licensed business model"},
    {"stem": "freelance",    "gloss": "freelance, self-employed independent work"},
    {"stem": "remote",       "gloss": "remote, working from a non-office location"},
    {"stem": "hybrid",       "gloss": "hybrid, mix of remote and in-office work"},
    {"stem": "productivity", "gloss": "productivity, efficiency of output"},
    {"stem": "performance",  "gloss": "performance, how well something functions"},
    {"stem": "evaluation",   "gloss": "evaluation, formal assessment"},
    {"stem": "certification","gloss": "certification, official qualification"},
    {"stem": "accreditation","gloss": "accreditation, formal recognition of quality"},
    {"stem": "regulation",   "gloss": "regulation, official rule or law"},
    {"stem": "policy",       "gloss": "policy, set of guidelines or rules"},
])

add_en("trade", [
    {"stem": "ecommerce",    "gloss": "e-commerce, buying and selling online"},
    {"stem": "marketplace",  "gloss": "marketplace, platform for buying/selling"},
    {"stem": "checkout",     "gloss": "checkout, process of completing a purchase"},
    {"stem": "cart",         "gloss": "cart, virtual shopping basket"},
    {"stem": "wishlist",     "gloss": "wishlist, saved items for future purchase"},
    {"stem": "refund",       "gloss": "refund, money returned to customer"},
    {"stem": "chargeback",   "gloss": "chargeback, disputed transaction reversal"},
    {"stem": "subscription", "gloss": "subscription, recurring payment for access"},
    {"stem": "tier",         "gloss": "tier, level of service or pricing"},
    {"stem": "upsell",       "gloss": "upsell, selling higher-value option"},
    {"stem": "conversion",   "gloss": "conversion, turning prospect into buyer"},
    {"stem": "retention",    "gloss": "retention, keeping existing customers"},
    {"stem": "churn",        "gloss": "churn, rate customers stop using service"},
    {"stem": "acquisition",  "gloss": "customer acquisition, gaining new customers"},
    {"stem": "funnel",       "gloss": "funnel, stages of customer journey"},
    {"stem": "lead",         "gloss": "lead, potential customer"},
    {"stem": "prospect",     "gloss": "prospect, potential future customer"},
    {"stem": "crm",          "gloss": "CRM, customer relationship management"},
    {"stem": "erp",          "gloss": "ERP, enterprise resource planning"},
    {"stem": "inventory",    "gloss": "inventory, stock of goods"},
    {"stem": "fulfillment",  "gloss": "fulfillment, completing an order"},
    {"stem": "logistics",    "gloss": "logistics, managing movement of goods"},
    {"stem": "supply",       "gloss": "supply, providing goods or services"},
    {"stem": "demand",       "gloss": "demand, consumer desire for a product"},
    {"stem": "wholesale",    "gloss": "wholesale, selling in bulk at lower prices"},
    {"stem": "retail",       "gloss": "retail, selling directly to consumers"},
    {"stem": "brand",        "gloss": "brand, identity of a product or company"},
    {"stem": "branding",     "gloss": "branding, creating a brand identity"},
    {"stem": "campaign",     "gloss": "campaign, organized marketing effort"},
    {"stem": "advertising",  "gloss": "advertising, promoting products publicly"},
    {"stem": "sponsorship",  "gloss": "sponsorship, supporting event financially"},
    {"stem": "partnership",  "gloss": "partnership, formal business collaboration"},
    {"stem": "affiliate",    "gloss": "affiliate, partner who earns commission"},
    {"stem": "commission",   "gloss": "commission, fee for selling on behalf"},
    {"stem": "pricing",      "gloss": "pricing, setting prices for products"},
    {"stem": "discount",     "gloss": "discount, reduction in price"},
    {"stem": "coupon",       "gloss": "coupon, voucher for price reduction"},
    {"stem": "promo",        "gloss": "promo, promotional offer"},
    {"stem": "promotion",    "gloss": "promotion, special offer to boost sales"},
    {"stem": "warranty",     "gloss": "warranty, guarantee of product quality"},
    {"stem": "return",       "gloss": "return, sending product back for refund"},
    {"stem": "exchange",     "gloss": "exchange, swapping one product for another"},
])

# ── social / customer service ─────────────────────────────────────────────────
add_en("social", [
    {"stem": "community",    "gloss": "community, group sharing common interest"},
    {"stem": "engagement",   "gloss": "engagement, interaction with audience"},
    {"stem": "follower",     "gloss": "follower, person who follows an account"},
    {"stem": "influencer",   "gloss": "influencer, person with large social following"},
    {"stem": "content",      "gloss": "content, information or media produced"},
    {"stem": "post",         "gloss": "post, message published on social media"},
    {"stem": "share",        "gloss": "share, distribute content to others"},
    {"stem": "like",         "gloss": "like, approve or endorse a post"},
    {"stem": "comment",      "gloss": "comment, textual response to a post"},
    {"stem": "mention",      "gloss": "mention, referencing someone in a post"},
    {"stem": "hashtag",      "gloss": "hashtag, keyword tag for social media"},
    {"stem": "trending",     "gloss": "trending, currently popular topic"},
    {"stem": "viral",        "gloss": "viral, spreading rapidly online"},
    {"stem": "algorithm",    "gloss": "algorithm, rules for content distribution"},
    {"stem": "platform",     "gloss": "platform, digital service for interaction"},
    {"stem": "creator",      "gloss": "creator, person who makes digital content"},
    {"stem": "broadcast",    "gloss": "broadcast, transmit content widely"},
    {"stem": "stream",       "gloss": "stream, live video or audio content"},
    {"stem": "podcast",      "gloss": "podcast, audio show for listening"},
    {"stem": "newsletter",   "gloss": "newsletter, regular email update"},
    {"stem": "survey",       "gloss": "survey, gathering opinions from people"},
    {"stem": "review",       "gloss": "review, evaluation of a product or service"},
    {"stem": "rating",       "gloss": "rating, score given to something"},
    {"stem": "feedback",     "gloss": "feedback, response or opinion given"},
    {"stem": "complaint",    "gloss": "complaint, expression of dissatisfaction"},
    {"stem": "inquiry",      "gloss": "inquiry, request for information"},
    {"stem": "ticket",       "gloss": "ticket, record of a support request"},
    {"stem": "escalation",   "gloss": "escalation, raising issue to higher support"},
    {"stem": "resolution",   "gloss": "resolution, solving a problem or issue"},
    {"stem": "satisfaction",  "gloss": "satisfaction, fulfillment of expectations"},
    {"stem": "experience",   "gloss": "experience, how something feels to user"},
    {"stem": "journey",      "gloss": "customer journey, path through product"},
])

# ── finance (modern) ─────────────────────────────────────────────────────────
add_en("trade.currency", [
    {"stem": "crypto",       "gloss": "crypto, cryptocurrency"},
    {"stem": "bitcoin",      "gloss": "Bitcoin, leading cryptocurrency"},
    {"stem": "blockchain",   "gloss": "blockchain, distributed ledger technology"},
    {"stem": "defi",         "gloss": "DeFi, decentralized finance"},
    {"stem": "nft",          "gloss": "NFT, non-fungible token"},
    {"stem": "token",        "gloss": "token, unit of cryptocurrency"},
    {"stem": "wallet",       "gloss": "wallet, storage for cryptocurrency"},
    {"stem": "exchange",     "gloss": "exchange, platform for trading currencies"},
    {"stem": "stablecoin",   "gloss": "stablecoin, price-stable cryptocurrency"},
    {"stem": "fintech",      "gloss": "fintech, financial technology"},
    {"stem": "neobank",      "gloss": "neobank, digital-only bank"},
    {"stem": "paywall",      "gloss": "paywall, content requiring payment to access"},
])

# ── healthcare (modern) ───────────────────────────────────────────────────────
add_en("health", [
    {"stem": "telemedicine", "gloss": "telemedicine, healthcare via remote technology"},
    {"stem": "telehealth",   "gloss": "telehealth, remote health services"},
    {"stem": "wearable",     "gloss": "wearable, device worn to track health"},
    {"stem": "biometric",    "gloss": "biometric, biological measurement for ID"},
    {"stem": "genomics",     "gloss": "genomics, study of genomes"},
    {"stem": "biotech",      "gloss": "biotech, biology and technology industry"},
    {"stem": "clinical",     "gloss": "clinical, relating to medical care"},
    {"stem": "trial",        "gloss": "clinical trial, test of new treatment"},
    {"stem": "protocol",     "gloss": "protocol, set procedure for treatment"},
    {"stem": "referral",     "gloss": "referral, directing patient to specialist"},
    {"stem": "preventive",   "gloss": "preventive, stopping illness before it occurs"},
    {"stem": "wellness",     "gloss": "wellness, state of being healthy"},
    {"stem": "mental",       "gloss": "mental, relating to the mind"},
    {"stem": "anxiety",      "gloss": "anxiety, feeling of worry or nervousness"},
    {"stem": "depression",   "gloss": "depression, mental health condition"},
    {"stem": "burnout",      "gloss": "burnout, exhaustion from chronic stress"},
])

# ── governance / legal (modern) ───────────────────────────────────────────────
add_en("govern", [
    {"stem": "gdpr",         "gloss": "GDPR, EU data protection regulation"},
    {"stem": "compliance",   "gloss": "compliance, adhering to rules"},
    {"stem": "regulation",   "gloss": "regulation, official rule or directive"},
    {"stem": "jurisdiction", "gloss": "jurisdiction, legal authority of a court"},
    {"stem": "trademark",    "gloss": "trademark, protected brand identifier"},
    {"stem": "patent",       "gloss": "patent, exclusive right to an invention"},
    {"stem": "copyright",    "gloss": "copyright, legal right over creative work"},
    {"stem": "liability",    "gloss": "liability, legal responsibility"},
    {"stem": "litigation",   "gloss": "litigation, legal dispute process"},
    {"stem": "arbitration",  "gloss": "arbitration, alternative dispute resolution"},
    {"stem": "sanction",     "gloss": "sanction, penalty or trade restriction"},
])

# ── write / content creation ──────────────────────────────────────────────────
add_en("write", [
    {"stem": "blog",         "gloss": "blog, online journal or informational site"},
    {"stem": "article",      "gloss": "article, written piece for publication"},
    {"stem": "headline",     "gloss": "headline, title of a news article"},
    {"stem": "caption",      "gloss": "caption, text accompanying an image"},
    {"stem": "summary",      "gloss": "summary, brief statement of main points"},
    {"stem": "outline",      "gloss": "outline, structured plan for writing"},
    {"stem": "draft",        "gloss": "draft, preliminary version of a document"},
    {"stem": "revision",     "gloss": "revision, corrected version of a document"},
    {"stem": "proofreading", "gloss": "proofreading, checking text for errors"},
    {"stem": "copywriting",  "gloss": "copywriting, writing for marketing"},
    {"stem": "ghostwriting", "gloss": "ghostwriting, writing for another person"},
    {"stem": "documentation","gloss": "documentation, written technical reference"},
    {"stem": "transcript",   "gloss": "transcript, written record of spoken words"},
    {"stem": "subtitle",     "gloss": "subtitle, text overlay in video"},
])

# ══════════════════════════════════════════════════════════════════════════════
# 7. SAVE ALL
# ════════════════════════════════════════════════════════════════════════════════
print("\n── Saving ───────────────────────────────────────────────────────────")
save(CONCEPTS, concepts)
save(FW_AR, fw_ar)
save(STRUCT_AR, struct_ar)
save(RELS_AR, rels_ar)
save(COMPOUNDS_AR, compounds_ar)

print("\nDone! Now run: node scripts/build-vocab.mjs")
