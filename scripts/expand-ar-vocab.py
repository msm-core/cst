#!/usr/bin/env python3
"""
scripts/expand-ar-vocab.py — Expand vocab/ar/stems.json from Roots_permutations.csv

Usage:
    python3 scripts/expand-ar-vocab.py [--dry-run] [--min-confidence 0.6]

Options:
    --dry-run            Print stats but don't write any files
    --min-confidence N   Auto-approve threshold 0.0–1.0 (default: 0.75)
    --review-threshold N Lower bound for review.json (default: 0.40)

Outputs:
    vocab/ar/stems.json         Updated (new entries appended, existing untouched)
    plan/results/ar-review.json Words needing human review (confidence between thresholds)
    plan/results/ar-expand-report.txt  Summary report
"""

import csv
import json
import re
import sys
import os
from pathlib import Path
from collections import defaultdict

ROOT_DIR = Path(__file__).parent.parent
STEMS_FILE = ROOT_DIR / "vocab" / "ar" / "stems.json"
CSV_FILE = ROOT_DIR / "plan" / "Roots_permutations.csv"
RESULTS_DIR = ROOT_DIR / "plan" / "results"
REVIEW_FILE = RESULTS_DIR / "ar-review.json"
REPORT_FILE = RESULTS_DIR / "ar-expand-report.txt"

# ── CLI args ─────────────────────────────────────────────────────────────────
DRY_RUN = "--dry-run" in sys.argv
MIN_CONF_ARG = next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--min-confidence"), "0.75")
REVIEW_ARG = next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--review-threshold"), "0.40")
AUTO_THRESHOLD = float(MIN_CONF_ARG)
REVIEW_THRESHOLD = float(REVIEW_ARG)

# ── Arabic normalization (mirrors ar.ts) ──────────────────────────────────────
def normalize_ar(text: str) -> str:
    text = re.sub(r'[\u064B-\u065F\u0670]', '', text)   # diacritics
    text = re.sub(r'\u0640', '', text)                   # tatweel
    text = re.sub(r'[\u0622\u0623\u0625\u0671]', '\u0627', text)  # alef variants → ا
    text = re.sub(r'\u0649', '\u064A', text)             # ى → ي
    text = re.sub(r'\u0624', '\u0648', text)             # ؤ → و
    text = re.sub(r'\u0629', '\u0647', text)             # ة → ه
    return text.strip()

# ── Gloss → CST field mapping ─────────────────────────────────────────────────
# Each entry: (keywords_tuple, field, gloss_description)
# Multiple keywords can match; confidence = best_match_weight / total_keywords
FIELD_RULES = [
    # Cognition
    (("know", "learn", "understand", "inform", "news", "aware", "cognit", "recogni",
      "notice", "observe", "remember", "forget", "study", "research", "investigate"), "know", "know, learn"),
    (("think", "consider", "reflect", "ponder", "meditat", "contemplate", "deliberat",
      "reason", "logic", "analyz", "assess", "evaluat", "judge", "opine", "believ"), "think", "think, consider"),
    (("see", "look", "watch", "view", "gaze", "stare", "observe", "witness", "perceive",
      "vision", "sight", "appear", "visible", "peek"), "see", "see, look"),
    (("feel", "emotion", "mood", "affect", "sentiment", "suffer", "enjoy", "happy",
      "sad", "anger", "fear", "love", "hate", "joy", "grief", "sorry", "regret",
      "please", "delight", "distress", "sadden", "grieve", "pain", "hurt"), "feel", "feel, emotion"),

    # Communication
    (("speak", "say", "tell", "utter", "voice", "talk", "converse", "narrat",
      "express", "announc", "declar", "proclaim", "shout", "whisper", "mention",
      "call", "address", "speak", "oral"), "speak", "speak, say"),
    (("write", "record", "inscrib", "document", "note", "text", "script", "pen",
      "compose", "draft", "author", "publish", "print", "letter", "book"), "write", "write, record"),
    (("read", "recite", "scan", "peruse", "interpret", "decipher"), "read", "read"),

    # Action & Creation
    (("make", "build", "construct", "fabricat", "manufact", "produce", "assemble",
      "form", "shape", "mold", "craft", "forge", "erect", "establish"), "make", "make, build"),
    (("create", "invent", "design", "originate", "generat", "found", "initiat",
      "start", "begin", "launch"), "create", "create, invent"),
    (("destroy", "break", "demolish", "ruin", "damage", "harm", "wreck",
      "eradicate", "eliminate", "annihilate", "exterminate", "abolish",
      "remove", "delete", "erase", "wipe"), "destroy", "destroy, break"),
    (("change", "transform", "alter", "convert", "modify", "adapt", "adjust",
      "reform", "revise", "update", "shift", "turn", "switch", "vary"), "change", "change, transform"),
    (("fix", "repair", "restore", "correct", "heal", "cure", "remedy", "recover",
      "rehabilitat", "maintain", "preserve", "protect", "guard", "save"), "fix", "fix, repair"),
    (("work", "labor", "employ", "job", "profession", "duty", "task", "function",
      "operate", "perform", "practice", "act", "effort", "industry"), "work", "work, employ"),
    (("enable", "allow", "permit", "grant", "authorize", "empower", "equip",
      "prepare", "qualify", "activate"), "enable", "enable, allow"),

    # Movement & Transfer
    (("move", "go", "travel", "walk", "run", "journey", "walk", "march",
      "proceed", "advance", "approach", "depart", "flee", "escape", "roam",
      "wander", "migrate", "immigrate"), "move", "move, travel"),
    (("send", "transmit", "deliver", "dispatch", "forward", "transfer", "remit",
      "convey", "export", "import", "ship", "post"), "send", "send, deliver"),
    (("give", "grant", "donate", "offer", "provide", "supply", "present",
      "bestow", "lend", "award", "allocate", "assign"), "give", "give, grant"),
    (("take", "grab", "receive", "get", "obtain", "acquire", "collect",
      "fetch", "retrieve", "capture", "seize", "arrest", "confiscat"), "take", "take, get"),
    (("gather", "collect", "accumulate", "assemble", "congregate", "meet",
      "unite", "combine", "compile", "aggregate"), "gather", "gather, collect"),
    (("hold", "carry", "bear", "support", "contain", "keep", "retain",
      "maintain", "grip", "clasp", "embrace"), "hold", "hold, carry"),
    (("open", "unlock", "reveal", "expose", "disclose", "uncover", "release",
      "free", "liberate", "launch"), "open", "open, reveal"),
    (("hide", "conceal", "cover", "bury", "mask", "disguise", "secrete",
      "suppress", "obscure"), "hide", "hide, conceal"),
    (("connect", "link", "join", "attach", "bind", "tie", "couple",
      "integrate", "merge", "combine", "unite", "relate"), "connect", "connect, link"),

    # Existence & State
    # NOTE: "be" is intentionally excluded — "be X" glosses should match X's field, not exist.
    (("exist", "live", "remain", "stay", "persist", "continue", "last",
      "survive", "inhabit", "dwell", "reside", "abide", "subsist"), "exist", "exist, remain"),
    (("rest", "sleep", "relax", "pause", "stop", "halt", "cease", "end",
      "finish", "complete", "retire", "seclusion"), "rest", "rest, stop"),
    (("want", "desire", "wish", "hope", "aspire", "seek", "aim", "intend",
      "plan", "purpose", "will"), "want", "want, desire"),

    # Social & Power
    (("govern", "rule", "manage", "administer", "control", "lead", "direct",
      "command", "authority", "power", "regime", "government", "state",
      "parliament", "law", "legal", "policy", "official", "minister",
      "king", "president", "military", "army", "soldier", "defense"), "govern", "govern, rule"),
    (("fight", "war", "battle", "conflict", "attack", "assault", "strike",
      "oppose", "resist", "rebel", "revolt", "combat", "struggle",
      "compete", "contest", "dispute", "disagree", "debate"), "fight", "fight, conflict"),
    (("trade", "buy", "sell", "commerce", "market", "business", "deal",
      "exchange", "transaction", "negotiate", "contract", "price",
      "purchase", "money", "pay", "cost", "finance", "bank", "invest"), "trade", "trade, commerce"),
    (("social", "meet", "friend", "community", "society", "relation",
      "interact", "celebrate", "visit", "greet", "party", "festiv",
      "event", "ceremony", "custom", "tradition"), "social", "social, meet"),
    (("possess", "own", "property", "belong", "wealth", "rich", "asset",
      "resource", "control", "dominate", "master"), "possess", "possess, own"),

    # Domain Knowledge
    (("health", "sick", "ill", "disease", "medicine", "treat", "doctor",
      "patient", "hospital", "symptom", "diagnose", "therapy", "surgery",
      "pharmaceutical", "drug", "virus", "infection", "wound", "injury"), "health", "health, medicine"),
    (("food", "eat", "drink", "cook", "meal", "cuisine", "nourish",
      "hunger", "feed", "taste", "flavor", "ingredient", "recipe",
      "bread", "meat", "fruit", "vegetable"), "food", "food, eat"),
    (("nature", "environment", "earth", "plant", "animal", "tree",
      "flower", "forest", "mountain", "river", "sea", "ocean",
      "weather", "climate", "season", "rain", "sun", "wind"), "nature", "nature, environment"),
    (("body", "physical", "organ", "limb", "head", "hand", "foot",
      "heart", "blood", "bone", "muscle", "face", "eye", "ear", "mouth"), "body", "body, physical"),
    (("time", "when", "moment", "period", "date", "hour", "day", "year",
      "duration", "history", "ancient", "era", "age", "century"), "time", "time, period"),
    (("space", "place", "location", "where", "area", "region", "district",
      "country", "city", "village", "position", "direction", "near", "far"), "space", "space, place"),
    (("quantity", "count", "measure", "amount", "number", "size", "volume",
      "weight", "length", "degree", "rate", "ratio", "percent"), "quantity", "quantity, measure"),
    (("quality", "good", "bad", "excellence", "value", "standard", "level",
      "grade", "rank", "status", "character", "nature", "type", "kind",
      "beautiful", "ugly", "strong", "weak", "big", "small", "high", "low",
      "new", "old", "clean", "dirty"), "quality", "quality, characteristic"),
    (("art", "music", "paint", "draw", "craft", "sculpture", "poetry",
      "literature", "sing", "dance", "theater", "film", "culture",
      "aesthetic", "decor", "design"), "art", "art, culture"),
    (("religion", "pray", "worship", "god", "faith", "spiritual", "holy",
      "sacred", "mosque", "church", "temple", "divine", "prophet",
      "belief", "ritual", "scripture", "quran", "bible"), "religion", "religion, faith"),
    (("science", "research", "experiment", "theory", "physics", "chemistry",
      "biology", "mathematics", "calculate", "formula", "element",
      "discover", "invent", "innovation", "technology"), "science", "science, research"),
    (("tech", "computer", "software", "digital", "internet", "network",
      "program", "code", "system", "machine", "device", "electronic",
      "robot", "artificial", "data"), "tech", "technology"),
    (("education", "school", "teach", "lesson", "course", "student",
      "teacher", "university", "college", "class", "train",
      "instruct", "curriculum", "degree", "diploma"), "education", "education, teach"),
    (("measure", "weigh", "scale", "compare", "calculate", "estimate",
      "approximate", "assess", "evaluate", "judge", "rate", "rank"), "measure", "measure, compare"),

    # Negative/behavioral (catch-all for stigma/behavior words that don't fit above)
    (("black", "dark", "slacken", "childish", "infantile", "vomit", "contempt",
      "disregard", "blame", "censure", "mislead", "seduce", "awaken", "rouse",
      "sting", "pollinate", "knee", "pitcher", "jug"), "quality", "quality (characteristic)"),
]

def gloss_to_field(gloss: str) -> tuple[str, float]:
    """
    Map an English gloss string to a CST field + confidence score.
    Returns (field, confidence) where confidence is 0.0–1.0.
    """
    gloss_lower = gloss.lower()
    # Tokenize gloss into words (split on ;, space, comma)
    gloss_words = re.split(r'[;\s,]+', gloss_lower)

    best_field = None
    best_score = 0.0

    for keywords, field, _ in FIELD_RULES:
        matches = sum(
            1 for kw in keywords
            if any(w.startswith(kw) or kw in w for w in gloss_words)
        )
        if matches > 0:
            # Score = fraction of gloss words matched, boosted by keyword specificity
            score = matches / max(len(gloss_words), 1)
            # Bonus for exact word match (not just prefix)
            exact = sum(1 for kw in keywords if kw in gloss_words)
            score += exact * 0.15
            score = min(score, 1.0)
            if score > best_score:
                best_score = score
                best_field = field

    return best_field, best_score


# ── Load existing stems ───────────────────────────────────────────────────────
raw = json.load(open(STEMS_FILE, "r", encoding="utf-8"))
existing = {k: v for k, v in raw.items() if not k.startswith("_")}
comment = raw.get("_comment", "")
print(f"Existing stems: {len(existing)}")

# ── Parse CSV ─────────────────────────────────────────────────────────────────
rows = list(csv.DictReader(open(CSV_FILE, encoding="utf-8")))
print(f"CSV rows: {len(rows)}")

# Build unique (normalized_root → first_gloss) map, skip already-covered roots
root_to_gloss: dict[str, str] = {}
for row in rows:
    root_raw = row.get("ROOT_ar", "").strip()
    gloss = row.get("GLOSS", "").strip()
    if not root_raw or not gloss:
        continue
    root_norm = normalize_ar(root_raw)
    if root_norm in existing:
        continue  # already covered
    if root_norm not in root_to_gloss:
        root_to_gloss[root_norm] = gloss

print(f"New roots to evaluate: {len(root_to_gloss)}")

# ── Classify ──────────────────────────────────────────────────────────────────
approved: dict[str, dict] = {}
review: list[dict] = []
skipped = 0

field_counts: dict[str, int] = defaultdict(int)

for root, gloss in root_to_gloss.items():
    field, conf = gloss_to_field(gloss)
    if field is None or conf < REVIEW_THRESHOLD:
        skipped += 1
        continue
    if conf >= AUTO_THRESHOLD:
        approved[root] = {"field": field, "gloss": gloss, "_conf": round(conf, 3)}
        field_counts[field] += 1
    else:
        review.append({
            "root": root,
            "gloss": gloss,
            "suggested_field": field,
            "confidence": round(conf, 3),
        })

print(f"\nResults:")
print(f"  Auto-approved (conf ≥ {AUTO_THRESHOLD}): {len(approved)}")
print(f"  Needs review  ({REVIEW_THRESHOLD} – {AUTO_THRESHOLD}): {len(review)}")
print(f"  Skipped       (conf < {REVIEW_THRESHOLD}): {skipped}")
print(f"\nField distribution (auto-approved):")
for field, count in sorted(field_counts.items(), key=lambda x: -x[1]):
    print(f"  {field:<22} {count}")

# ── Write outputs ─────────────────────────────────────────────────────────────
if not DRY_RUN:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    # Merge approved into existing stems (strip _conf before writing)
    merged = {"_comment": comment, **existing}
    added = 0
    for root, entry in approved.items():
        clean = {k: v for k, v in entry.items() if not k.startswith("_")}
        merged[root] = clean
        added += 1

    with open(STEMS_FILE, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
    print(f"\n✅ Written {added} new entries → {STEMS_FILE.relative_to(ROOT_DIR)}")

    # Write review file
    review_sorted = sorted(review, key=lambda x: -x["confidence"])
    with open(REVIEW_FILE, "w", encoding="utf-8") as f:
        json.dump(review_sorted, f, ensure_ascii=False, indent=2)
    print(f"📋 Written {len(review)} review entries → {REVIEW_FILE.relative_to(ROOT_DIR)}")

    # Write text report
    lines = [
        "Arabic Vocab Expansion Report",
        "=" * 50,
        f"Source CSV:         {CSV_FILE.name}",
        f"Existing stems:     {len(existing)}",
        f"New roots evaluated:{len(root_to_gloss)}",
        f"Auto-approved:      {len(approved)}  (conf ≥ {AUTO_THRESHOLD})",
        f"Needs review:       {len(review)}  ({REVIEW_THRESHOLD} – {AUTO_THRESHOLD})",
        f"Skipped:            {skipped}  (conf < {REVIEW_THRESHOLD})",
        f"Total stems now:    {len(merged) - 1}",  # -1 for _comment
        "",
        "Field distribution (auto-approved):",
    ]
    for field, count in sorted(field_counts.items(), key=lambda x: -x[1]):
        lines.append(f"  {field:<22} {count}")
    lines += [
        "",
        "Top 20 review candidates:",
    ]
    for entry in review_sorted[:20]:
        lines.append(f"  [{entry['confidence']:.2f}] {entry['root']:<12} → {entry['suggested_field']:<15}  {entry['gloss']}")

    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"📄 Written report → {REPORT_FILE.relative_to(ROOT_DIR)}")
else:
    print("\n[dry-run] No files written.")
