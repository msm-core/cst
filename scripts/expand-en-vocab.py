#!/usr/bin/env python3
"""
expand-en-vocab.py — Phase 3: Expand vocab/en/stems.json from NLTK WordNet.

Usage:
  python3 scripts/expand-en-vocab.py [options]

Options:
  --min-freq N          Minimum total lemma frequency to include (default: 3)
  --min-confidence F    Auto-approve threshold 0-1 (default: 0.55)
  --review-threshold F  Include in review file if above this (default: 0.25)
  --dry-run             Print stats without writing files
  --limit N             Only process first N lemmas (for testing)

Output:
  vocab/en/stems.json      Updated with new entries (existing keys preserved)
  plan/results/en-review.json   Entries needing human review
  plan/results/en-expand-report.txt  Summary report

WordNet lexname → CST field mapping:
  noun.cognition   → know
  noun.communication → speak
  noun.act         → work
  noun.possession  → possess / trade (by gloss keyword)
  etc.
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
STEMS_PATH = ROOT / "vocab" / "en" / "stems.json"
SPEC_PATH = ROOT / "vocab" / "spec" / "fields.json"
REVIEW_PATH = ROOT / "plan" / "results" / "en-review.json"
REPORT_PATH = ROOT / "plan" / "results" / "en-expand-report.txt"
REVIEW_PATH.parent.mkdir(parents=True, exist_ok=True)

# ── WordNet lexname → primary CST field ───────────────────────────────────────
LEXNAME_TO_FIELD: dict[str, str | None] = {
    # Nouns
    "noun.act":           "work",
    "noun.animal":        "animal",
    "noun.artifact":      "make",
    "noun.attribute":     "quality",
    "noun.body":          "body",
    "noun.cognition":     "know",
    "noun.communication": "speak",
    "noun.event":         "time",
    "noun.feeling":       "feel",
    "noun.food":          "food",
    "noun.group":         "social",
    "noun.location":      "place",
    "noun.motive":        "want",
    "noun.object":        "material",
    "noun.person":        "person",
    "noun.phenomenon":    "science",
    "noun.plant":         "plant",
    "noun.possession":    "possess",
    "noun.process":       "change",
    "noun.quantity":      "measure",
    "noun.relation":      "connect",
    "noun.shape":         "structure",
    "noun.state":         "exist",
    "noun.substance":     "material",
    "noun.time":          "time",
    "noun.Tops":          None,   # too abstract, skip
    # Verbs
    "verb.body":          "body",
    "verb.change":        "change",
    "verb.cognition":     "know",
    "verb.communication": "speak",
    "verb.competition":   "fight",
    "verb.consumption":   "take",
    "verb.contact":       "hold",
    "verb.creation":      "make",
    "verb.emotion":       "feel",
    "verb.motion":        "move",
    "verb.perception":    "see",
    "verb.possession":    "possess",
    "verb.social":        "social",
    "verb.stative":       "exist",
    "verb.weather":       "weather",
    # Adjectives / adverbs — attach to quality by default
    "adj.all":            "quality",
    "adj.pert":           "quality",
    "adj.ppl":            "quality",
    "adv.all":            "quality",
}

# Gloss keywords that refine the field (checked against the first sense definition)
# Format: [keyword_set, override_field]
GLOSS_REFINEMENTS: list[tuple[frozenset[str], str]] = [
    (frozenset({"money", "cash", "currency", "financial", "bank", "fund", "payment",
                "invest", "price", "cost", "trade", "loan", "credit", "tax"}), "trade"),
    (frozenset({"language", "word", "speech", "grammar", "linguistic", "dialect",
                "vocabulary", "phrase", "sentence", "spoken"}), "speak"),
    (frozenset({"medical", "disease", "symptom", "pain", "drug", "therapy", "illness",
                "treatment", "health", "clinic", "surgery", "diagnosis"}), "health"),
    (frozenset({"computer", "software", "digital", "program", "internet", "network",
                "device", "machine", "hardware", "code", "algorithm"}), "tech"),
    (frozenset({"government", "political", "law", "authority", "rule", "rights",
                "democratic", "parliament", "legal", "court", "judge"}), "govern"),
    (frozenset({"food", "eat", "cook", "recipe", "meal", "nutrition",
                "cuisine", "ingredient", "restaurant"}), "food"),
    (frozenset({"travel", "move", "journey", "route", "transport",
                "vehicle", "navigate", "path"}), "move"),
    (frozenset({"know", "knowledge", "information", "fact", "understand",
                "learn", "education", "data", "memory", "thought", "reason"}), "know"),
    (frozenset({"time", "date", "duration", "hour", "minute", "period",
                "schedule", "calendar", "deadline", "age"}), "time"),
    (frozenset({"place", "location", "geographic", "city", "country", "region",
                "territory", "area", "district"}), "place"),
    (frozenset({"music", "song", "art", "film", "movie", "paint", "draw",
                "creative", "design", "poetry", "novel"}), "art"),
    (frozenset({"sport", "game", "athletic", "compete", "team", "player",
                "match", "championship"}), "sport"),
    (frozenset({"nature", "environment", "ecology", "plant", "animal",
                "forest", "ocean", "climate"}), "nature"),
    (frozenset({"weather", "rain", "temperature", "climate", "forecast",
                "wind", "snow", "storm"}), "weather"),
    (frozenset({"science", "research", "experiment", "theory", "biology",
                "chemistry", "physics", "laboratory"}), "science"),
]

# Words to always skip (proper nouns, abbreviations, noise)
SKIP_PATTERNS = re.compile(
    r"^([A-Z]|[0-9]|_|-|\.)"  # proper nouns (capitalized), digits, special chars
    r"|[^a-zA-Z\-]"            # non-alphabetic chars (digits, apostrophes in lemma)
    r"|^.{1,2}$"               # too short
    r"|^.{25,}$"               # too long (compound noise)
)

# Additional stop words that aren't useful stems
STOP_STEMS = frozenset({
    "would", "could", "should", "shall", "will", "might", "must", "may",
    "make", "take", "give", "come", "go", "see", "know", "think", "look",
    "use", "find", "want", "tell", "ask", "seem", "feel", "try", "leave",
    "call", "keep", "let", "put", "run", "set", "add", "play",
    "very", "well", "back", "still", "just", "more", "most", "much",
    "good", "great", "little", "big", "long", "high", "low", "old", "new",
    "same", "last", "next", "early", "late", "right", "left", "own",
    # Already in function-words.json / SKIP_WORDS
    "not", "no", "yes", "please", "okay", "ok",
})


def refine_field(base_field: str, gloss: str) -> str:
    """Refine the base field using gloss keywords."""
    gloss_lower = gloss.lower()
    gloss_words = set(re.findall(r"\w+", gloss_lower))
    for keywords, override in GLOSS_REFINEMENTS:
        if keywords & gloss_words:
            return override
    return base_field


def compute_confidence(lemma: str, synsets: list, field: str) -> float:
    """
    Confidence based on:
    - Sense frequency (SemCor counts when available)
    - Number of distinct fields across senses (field agreement boosts confidence)
    - Falls back to field-agreement ratio when no frequency data
    """
    if not synsets:
        return 0.0

    counts = []
    for syn in synsets:
        for lemma_obj in syn.lemmas():
            if lemma_obj.name().lower() == lemma:
                counts.append(lemma_obj.count())
                break
        else:
            counts.append(0)

    total = sum(counts)
    if total > 0:
        # Frequency-weighted confidence: fraction of frequency in top sense
        top = counts[0]
        freq_conf = top / total
    else:
        freq_conf = None

    # Field agreement: what fraction of senses agree with our mapped field
    agree = 0
    for syn in synsets:
        lexname = syn.lexname()
        mapped = LEXNAME_TO_FIELD.get(lexname)
        if mapped == field or (mapped and field.startswith(mapped)):
            agree += 1
    field_conf = agree / len(synsets)

    if freq_conf is not None:
        # Blend frequency and field agreement
        return round(0.6 * freq_conf + 0.4 * field_conf, 3)
    else:
        # Only field agreement available
        return round(field_conf, 3)


def process_lemma(lemma_name: str, wn) -> dict | None:
    """
    Return a dict {field, gloss, confidence} for a lemma, or None to skip.
    """
    lower = lemma_name.lower().replace("_", " ")

    # Single word only (no spaces from multi-word lemmas)
    if " " in lower:
        return None

    if SKIP_PATTERNS.search(lower) or lower in STOP_STEMS:
        return None

    synsets = wn.synsets(lower)
    if not synsets:
        return None

    # Pick the most frequent sense first
    def sense_freq(syn):
        for lem in syn.lemmas():
            if lem.name().lower() == lower:
                return lem.count()
        return 0

    synsets_sorted = sorted(synsets, key=sense_freq, reverse=True)
    top_syn = synsets_sorted[0]
    lexname = top_syn.lexname()
    base_field = LEXNAME_TO_FIELD.get(lexname)
    if base_field is None:
        return None

    gloss = top_syn.definition()
    field = refine_field(base_field, gloss)

    return {
        "lemma": lower,
        "field": field,
        "gloss": gloss[:80],   # truncate long glosses
        "confidence": 0.0,     # filled in main loop
        "lexname": lexname,
        "polysemy": len(synsets),
        "_synsets": synsets_sorted,  # temp; removed before writing
    }


def main():
    parser = argparse.ArgumentParser(description="Expand English stems from WordNet")
    parser.add_argument("--min-freq", type=int, default=0,
                        help="Minimum lemma frequency to consider (0 = include all)")
    parser.add_argument("--min-confidence", type=float, default=0.55,
                        help="Auto-approve threshold (default: 0.55)")
    parser.add_argument("--review-threshold", type=float, default=0.25,
                        help="Include in review file if confidence >= this (default: 0.25)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print stats without writing files")
    parser.add_argument("--limit", type=int, default=0,
                        help="Only process first N lemmas (for testing)")
    args = parser.parse_args()

    print("Loading NLTK WordNet…")
    try:
        import nltk
        nltk.download("wordnet", quiet=True)
        from nltk.corpus import wordnet as wn
    except ImportError:
        print("ERROR: nltk not installed. Run: pip3 install nltk", file=sys.stderr)
        sys.exit(1)

    # Load existing stems and valid fields
    stems = json.loads(STEMS_PATH.read_text())
    existing = {k for k in stems if not k.startswith("_")}
    valid_fields = set(json.loads(SPEC_PATH.read_text()).keys())

    print(f"Existing stems: {len(existing)}")
    print(f"Valid fields: {len(valid_fields)}")

    # Collect all unique lemma names from WordNet
    all_lemmas: set[str] = set()
    for syn in wn.all_synsets():
        for lem in syn.lemmas():
            all_lemmas.add(lem.name())

    all_lemmas_list = sorted(all_lemmas)
    if args.limit:
        all_lemmas_list = all_lemmas_list[: args.limit]

    print(f"WordNet lemmas to evaluate: {len(all_lemmas_list)}")

    # Process
    approved: list[dict] = []
    review: list[dict] = []
    skipped = 0
    already_have = 0
    field_counts: dict[str, int] = defaultdict(int)

    for lemma_name in all_lemmas_list:
        lower = lemma_name.lower().replace("_", " ")
        if " " in lower:
            skipped += 1
            continue
        if lower in existing:
            already_have += 1
            continue

        result = process_lemma(lemma_name, wn)
        if result is None:
            skipped += 1
            continue

        if result["field"] not in valid_fields:
            skipped += 1
            continue

        synsets_sorted = result.pop("_synsets")
        confidence = compute_confidence(lower, synsets_sorted, result["field"])
        result["confidence"] = confidence

        if confidence >= args.min_confidence:
            approved.append(result)
            field_counts[result["field"]] += 1
        elif confidence >= args.review_threshold:
            review.append(result)

    print(f"\nResults:")
    print(f"  Already in vocab:  {already_have:,}")
    print(f"  Skipped:           {skipped:,}")
    print(f"  Auto-approved:     {len(approved):,}")
    print(f"  Needs review:      {len(review):,}")

    print("\nTop fields in approved:")
    for field, count in sorted(field_counts.items(), key=lambda x: -x[1])[:15]:
        print(f"  {field:<20} {count:,}")

    if args.dry_run:
        print("\n--dry-run: no files written.")
        return

    # Write approved entries to stems.json
    for entry in approved:
        stems[entry["lemma"]] = {
            "field": entry["field"],
            "gloss": entry["gloss"],
        }

    STEMS_PATH.write_text(json.dumps(stems, ensure_ascii=False, indent=2))
    print(f"\nWrote {len(approved)} new stems → {STEMS_PATH}")

    # Write review file
    review_sorted = sorted(review, key=lambda x: -x["confidence"])
    REVIEW_PATH.write_text(json.dumps(review_sorted, ensure_ascii=False, indent=2))
    print(f"Wrote {len(review)} review entries → {REVIEW_PATH}")

    # Write text report
    total_stems = len([k for k in stems if not k.startswith("_")])
    report = [
        "expand-en-vocab.py — Expansion Report",
        f"  WordNet lemmas evaluated: {len(all_lemmas_list):,}",
        f"  Already in vocab:         {already_have:,}",
        f"  Skipped (noise/stop):     {skipped:,}",
        f"  Auto-approved:            {len(approved):,}",
        f"  Needs review:             {len(review):,}",
        f"  Total stems after:        {total_stems:,}",
        "",
        "Field distribution (approved):",
    ]
    for field, count in sorted(field_counts.items(), key=lambda x: -x[1]):
        report.append(f"  {field:<25} {count:,}")

    REPORT_PATH.write_text("\n".join(report))
    print(f"Wrote report → {REPORT_PATH}")


if __name__ == "__main__":
    main()
