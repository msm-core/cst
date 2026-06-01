#!/usr/bin/env python3
"""
Add missing high-frequency words to vocab/concepts.json.

English additions (covers ~3000 LIT occurrences from 10k eval):
  trade          : bank, reservation, pin, limit, shopping, visa, status
  trade.currency : dollar, apr
  move.drive     : car, tire, gas, oil, vehicle, fuel
  move           : luggage, bag
  time           : now, last, next, current, pm, am, timezone, date
  speak          : call, contact, message, text, dial, number
  tech.hardware  : phone, device, screen
  fix            : set (configure)
  make           : add, build
  work           : list, task, todo
  rest           : vacation, break

English function-word particles added to vocab/en/function-words.json:
  there, many, any, some, one, off, up

Arabic additions (covers top missing AR words from 10k eval):
  govern  : الحكومة, مجلس, الملك, الوطني, الوزراء
  sport   : لاعب
  place.country : المتحدة, الولايات, الأمريكية, أمريكي, العربية, العربي
  time    : السنة
  know    : اللغة
  trade   : جائزة
"""

import json
from pathlib import Path

ROOT = Path(__file__).parent.parent
CONCEPTS = ROOT / "vocab" / "concepts.json"
FW_EN    = ROOT / "vocab" / "en" / "function-words.json"

def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def save(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  Saved {path}")

# ── Load ──────────────────────────────────────────────────────────────────────

concepts = load(CONCEPTS)
fw_en    = load(FW_EN)

# ── Helper ────────────────────────────────────────────────────────────────────

def en_stems(field):
    """Return the set of existing EN stems for a field."""
    return {e["stem"] for e in concepts.get(field, {}).get("en", []) if "stem" in e}

def ar_stems(field):
    return {e.get("stem") or e.get("word") for e in concepts.get(field, {}).get("ar", [])}

def add_en(field, entries):
    """Add EN entries (list of {stem, gloss} dicts) to a field, skipping dupes."""
    existing = en_stems(field)
    if field not in concepts:
        concepts[field] = {"en": [], "ar": []}
    added = 0
    for e in entries:
        if e["stem"] not in existing:
            concepts[field]["en"].append(e)
            added += 1
    if added:
        print(f"  EN {field}: +{added} stems")

def add_ar(field, entries):
    """Add AR entries (list of {stem|word} dicts) to a field, skipping dupes."""
    existing = ar_stems(field)
    if field not in concepts:
        concepts[field] = {"en": [], "ar": []}
    added = 0
    for e in entries:
        key = e.get("stem") or e.get("word")
        if key not in existing:
            concepts[field]["ar"].append(e)
            added += 1
    if added:
        print(f"  AR {field}: +{added} entries")

# ── English content words ─────────────────────────────────────────────────────

add_en("trade", [
    {"stem": "bank",        "gloss": "bank, financial institution"},
    {"stem": "reservation", "gloss": "reservation, advance booking"},
    {"stem": "pin",         "gloss": "PIN, personal identification number"},
    {"stem": "limit",       "gloss": "limit, maximum allowed amount"},
    {"stem": "shopping",    "gloss": "shopping, buying goods"},
    {"stem": "visa",        "gloss": "visa, credit card or travel permit"},
    {"stem": "status",      "gloss": "status, current state of account/order"},
    {"stem": "insurance",   "gloss": "insurance, coverage plan"},
    {"stem": "reward",      "gloss": "reward, loyalty points or prize"},
    {"stem": "transfer",    "gloss": "transfer, move money between accounts"},
    {"stem": "routing",     "gloss": "routing, bank routing number"},
])

add_en("trade.currency", [
    {"stem": "dollar",  "gloss": "dollar, US currency unit"},
    {"stem": "apr",     "gloss": "APR, annual percentage rate"},
    {"stem": "rate",    "gloss": "rate, interest or exchange rate"},
])

add_en("move.drive", [
    {"stem": "car",     "gloss": "car, automobile"},
    {"stem": "tire",    "gloss": "tire, wheel rubber"},
    {"stem": "gas",     "gloss": "gas, fuel for vehicle"},
    {"stem": "oil",     "gloss": "oil, engine lubricant"},
    {"stem": "vehicle", "gloss": "vehicle, motor transport"},
    {"stem": "fuel",    "gloss": "fuel, energy source for engine"},
    {"stem": "auto",    "gloss": "auto, automobile"},
    {"stem": "mpg",     "gloss": "MPG, miles per gallon, fuel efficiency"},
    {"stem": "mileage", "gloss": "mileage, distance traveled or fuel economy"},
])

add_en("move", [
    {"stem": "luggage",  "gloss": "luggage, baggage for travel"},
    {"stem": "bag",      "gloss": "bag, travel or personal bag"},
    {"stem": "boarding", "gloss": "boarding, getting onto a plane or bus"},
    {"stem": "airport",  "gloss": "airport, aviation hub"},
])

add_en("time", [
    {"stem": "now",      "gloss": "now, at this moment"},
    {"stem": "last",     "gloss": "last, most recent previous"},
    {"stem": "next",     "gloss": "next, immediately following"},
    {"stem": "current",  "gloss": "current, existing at this time"},
    {"stem": "pm",       "gloss": "PM, afternoon time designation"},
    {"stem": "am",       "gloss": "AM, morning time designation"},
    {"stem": "timezone", "gloss": "timezone, regional time zone"},
    {"stem": "date",     "gloss": "date, calendar date"},
    {"stem": "clock",    "gloss": "clock, timekeeping device"},
    {"stem": "timer",    "gloss": "timer, countdown device"},
    {"stem": "payday",   "gloss": "payday, day of salary payment"},
])

add_en("speak", [
    {"stem": "call",    "gloss": "call, telephone call"},
    {"stem": "contact", "gloss": "contact, reach someone"},
    {"stem": "message", "gloss": "message, text or voice message"},
    {"stem": "text",    "gloss": "text, SMS message"},
    {"stem": "dial",    "gloss": "dial, dial a phone number"},
    {"stem": "number",  "gloss": "number, phone or account number"},
    {"stem": "voicemail","gloss": "voicemail, recorded voice message"},
])

add_en("tech.hardware", [
    {"stem": "phone",   "gloss": "phone, mobile device"},
    {"stem": "device",  "gloss": "device, electronic hardware"},
    {"stem": "screen",  "gloss": "screen, display surface"},
    {"stem": "charger", "gloss": "charger, power adapter"},
    {"stem": "battery", "gloss": "battery, power source"},
])

add_en("fix", [
    {"stem": "set",     "gloss": "set, configure or establish"},
])

add_en("make", [
    {"stem": "add",     "gloss": "add, append or include"},
    {"stem": "build",   "gloss": "build, construct or create"},
    {"stem": "create",  "gloss": "create, make something new"},
])

add_en("work", [
    {"stem": "list",    "gloss": "list, itemised collection of tasks"},
    {"stem": "task",    "gloss": "task, work item or to-do"},
    {"stem": "todo",    "gloss": "todo, task to be completed"},
    {"stem": "remind",  "gloss": "remind, prompt to remember"},
    {"stem": "note",    "gloss": "note, written reminder"},
    {"stem": "pto",     "gloss": "PTO, paid time off"},
])

add_en("rest", [
    {"stem": "vacation", "gloss": "vacation, holiday time off"},
    {"stem": "break",    "gloss": "break, pause from work"},
])

add_en("trade.order", [
    {"stem": "track",    "gloss": "track, follow status of shipment"},
    {"stem": "ship",     "gloss": "ship, dispatch an order"},
    {"stem": "delivery", "gloss": "delivery, receiving shipped goods"},
    {"stem": "package",  "gloss": "package, parcel being shipped"},
])

add_en("food", [
    {"stem": "ingredient", "gloss": "ingredient, component of a recipe"},
    {"stem": "recipe",     "gloss": "recipe, cooking instructions"},
    {"stem": "cook",       "gloss": "cook, prepare food"},
    {"stem": "bake",       "gloss": "bake, cook in oven"},
])

add_en("know.search", [
    {"stem": "find",       "gloss": "find, locate or discover"},
    {"stem": "locate",     "gloss": "locate, determine location of"},
    {"stem": "lost",       "gloss": "lost, unable to find"},
    {"stem": "missing",    "gloss": "missing, not where expected"},
])

add_en("social", [
    {"stem": "uber",       "gloss": "Uber, ride-hailing service"},
    {"stem": "tip",        "gloss": "tip, gratuity or advice"},
])

# ── English function-word particles ───────────────────────────────────────────

NEW_FW = {
    "there":   {"type": "STR", "structure": "existential"},
    "many":    {"type": "STR", "structure": "quantity"},
    "any":     {"type": "STR", "structure": "quantity"},
    "some":    {"type": "STR", "structure": "quantity"},
    "one":     {"type": "STR", "structure": "quantity"},
    "off":     {"type": "REL", "relation": "off"},
    "up":      {"type": "REL", "relation": "up"},
    "again":   {"type": "STR", "structure": "repeat"},
    "just":    {"type": "STR", "structure": "emphasis"},
    "already": {"type": "STR", "structure": "completeness"},
    "yet":     {"type": "STR", "structure": "completeness"},
    "back":    {"type": "REL", "relation": "back"},
    "down":    {"type": "REL", "relation": "down"},
    "under":   {"type": "REL", "relation": "under"},
    "over":    {"type": "REL", "relation": "over"},
}

fw_added = 0
for word, value in NEW_FW.items():
    if word not in fw_en:
        fw_en[word] = value
        fw_added += 1
print(f"  EN function-words: +{fw_added} entries")

# ── Arabic content words ──────────────────────────────────────────────────────

add_ar("govern", [
    {"word": "الحكومة"},
    {"word": "مجلس"},
    {"word": "الملك"},
    {"word": "الوطني"},
    {"word": "الوزراء"},
    {"word": "وزراء"},
    {"word": "وزير"},
    {"word": "الرئيس"},
    {"stem": "رئيس"},
    {"word": "الإمارة"},
    {"word": "الأمير"},
])

add_ar("sport", [
    {"word": "لاعب"},
    {"word": "لاعبون"},
    {"word": "لاعبين"},
])

add_ar("place.country", [
    {"word": "المتحدة"},
    {"word": "الولايات"},
    {"word": "الأمريكية"},
    {"word": "أمريكي"},
    {"word": "العربية"},
    {"word": "العربي"},
    {"word": "الأمريكي"},
    {"word": "الولايات المتحدة"},
    {"word": "إسرائيل"},
    {"word": "الغربية"},
])

add_ar("time", [
    {"word": "السنة"},
    {"word": "السنوات"},
    {"stem": "سنة"},
    {"stem": "عام"},
    {"stem": "أعوام"},
])

add_ar("know", [
    {"word": "اللغة"},
    {"stem": "لغة"},
])

add_ar("trade", [
    {"word": "جائزة"},
    {"word": "الجائزة"},
    {"word": "جوائز"},
])

add_ar("science", [
    {"word": "نوبل"},
    {"word": "العلماء"},
    {"word": "علماء"},
    {"stem": "عالم"},
])

add_ar("name", [
    {"word": "باسم"},
    {"word": "بن"},
    {"word": "ابن"},
    {"word": "أبو"},
    {"word": "أبي"},
])

add_ar("measure", [
    {"word": "عدد"},
    {"word": "الأعداد"},
])

# ── Save ──────────────────────────────────────────────────────────────────────

save(CONCEPTS, concepts)
save(FW_EN,    fw_en)
print("\nDone. Now run: npm run vocab && npm test")
