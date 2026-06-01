/**
 * spec.ts — The canonical, language-independent specification.
 *
 * This is the single source of truth for:
 *   - Semantic field names (level-1 and level-2)
 *   - Morphological roles
 *   - Structural markers
 *   - Relation categories
 *
 * Adding a field here is REQUIRED before any vocab file can use it.
 * Removing or renaming a field here is a BREAKING CHANGE.
 */

// ═══════════════════════════════════════════════════════════════
// 1. LEVEL-1 FIELDS  (42, backwards-compatible with nemo-ai)
// ═══════════════════════════════════════════════════════════════

/**
 * Level-1 field names are identical to nemo-ai's 42 semantic fields.
 * HDC atom vectors for these names are stable (SEED=42).
 * Do NOT rename these without a major version bump.
 */
export const FIELDS_L1 = [
  // Cognition & Communication
  "know",
  "think",
  "speak",
  "write",
  "see",
  "feel",
  "decide",
  // Action & Creation
  "make",
  "create",
  "destroy",
  "change",
  "fix",
  "work",
  "enable",
  // Movement & Transfer
  "move",
  "send",
  "give",
  "take",
  "gather",
  "hold",
  "open",
  "hide",
  "connect",
  // Existence & State
  "exist",
  "rest",
  "want",
  // Social & Power
  "govern",
  "fight",
  "trade",
  "social",
  "possess",
  // Domain Knowledge
  "science",
  "health",
  "tech",
  "art",
  "sport",
  // Physical World
  "nature",
  "weather",
  "animal",
  "plant",
  "body",
  "food",
  "material",
  "color",
  // Space, Time & Measure
  "time",
  "place",
  "dwell",
  "structure",
  "size",
  "measure",
  "quality",
  // Classification & Reference
  "person",
  "name",
  "contain",
  "force",
] as const;

export type FieldL1 = (typeof FIELDS_L1)[number];

// ═══════════════════════════════════════════════════════════════
// 2. LEVEL-2 FIELDS  (additive — dot notation, parent.child)
// ═══════════════════════════════════════════════════════════════

/**
 * Level-2 fields refine a level-1 field.
 * Format: "<level1>.<qualifier>"
 *
 * HDC encoding: bind(atom(level1), atom(qualifier))
 * A model trained only on level-1 still works — it just uses the parent.
 */
export const FIELDS_L2 = [
  // tech
  "tech.code", // programming, software, scripting
  "tech.ai", // machine learning, neural nets, AI models
  "tech.hardware", // CPU, GPU, device, chip
  "tech.network", // internet, Wi-Fi, server, cloud
  "tech.iot", // smart home, sensors, automation
  "tech.security", // encryption, auth, vulnerability
  // health
  "health.symptom", // pain, fever, cough, nausea
  "health.drug", // medication, antibiotic, prescription
  "health.treatment", // therapy, surgery, diagnosis
  "health.fitness", // exercise, gym, diet, nutrition
  // social
  "social.family", // mother, father, sibling, child
  "social.org", // company, institution, government body
  "social.contact", // friend, colleague, partner, acquaintance
  "social.community", // neighbourhood, group, tribe
  // time
  "time.alarm", // set alarm, wake up, reminder
  "time.calendar", // schedule, meeting, appointment, event
  "time.duration", // minutes, hours, days, how long
  // trade
  "trade.price", // cost, rate, how much
  "trade.order", // buy, purchase, checkout
  "trade.stock", // shares, exchange, market cap
  "trade.currency", // USD, EUR, SAR, crypto
  // know
  "know.search", // find, look up, Google
  "know.read", // book, article, document
  "know.news", // headline, update, report
  "know.question", // trivia, fact, definition
  // speak
  "speak.command", // turn on, set, open (imperative)
  "speak.greeting", // hello, hi, good morning
  "speak.farewell", // bye, goodbye, see you
  // move
  "move.drive", // car, road trip, navigate
  "move.fly", // flight, airport, airline
  "move.walk", // pedestrian, route, directions
  "move.ride", // bike, taxi, public transit
  // place
  "place.city", // named city, neighbourhood
  "place.country", // nation, nationality
  "place.home", // house, apartment, room
  "place.route", // road, direction, navigation
  // weather
  "weather.rain", // rain, precipitation, flood
  "weather.temp", // temperature, heat, cold
  "weather.forecast", // tomorrow's weather, weekly outlook
  // art
  "art.music", // song, album, musician, concert
  "art.film", // movie, director, cinema
  "art.visual", // painting, drawing, photography
  "art.book", // novel, poem, literature
  // food
  "food.recipe", // ingredients, cook, how to make
  "food.restaurant", // dining, café, order food
  "food.nutrition", // calories, vitamins, diet
] as const;

export type FieldL2 = (typeof FIELDS_L2)[number];

/** Union of all valid field strings */
export type Field = FieldL1 | FieldL2;

/** Get the level-1 parent of any field */
export function parentField(field: Field): FieldL1 {
  const dot = field.indexOf(".");
  if (dot === -1) return field as FieldL1;
  return field.slice(0, dot) as FieldL1;
}

/** Check if a string is a registered field */
export function isValidField(s: string): s is Field {
  return (
    (FIELDS_L1 as readonly string[]).includes(s) ||
    (FIELDS_L2 as readonly string[]).includes(s)
  );
}

// ═══════════════════════════════════════════════════════════════
// 3. MORPHOLOGICAL ROLES
// ═══════════════════════════════════════════════════════════════

export const ROLES = [
  "agent", // doer: writer, teacher, builder
  "patient", // receiver: employee, student
  "instance", // act/noun: writing, teaching, construction
  "state", // quality noun: kindness, strength
  "place", // location noun: library, factory
  "instrument", // tool noun: typewriter, calculator  (Arabic مفعال)
  "possible", // capability: readable, buildable
  "comparative", // more/most: bigger, faster, أكبر
  "negate", // reversal: unwrite, disconnect
  "repeat", // again: rewrite, rebuild
  "before", // prior: pre-
  "wrong", // error: misread, misjudge
  "excess", // over: overwrite, overload
  "mutual", // together: cooperate, collaborate
  "reflexive", // self-directed: subscribe, اكتتب (Form VIII)
  "result", // resultative: it broke, dissolved, انكسر (Form VII)
  "manner", // adverb: quickly, carefully
  "past", // completed: wrote, built
  "plural", // multiple: writers, books
  "intensifier", // Arabic فعّال
  "causer", // Arabic مُفعِل
  "seeker", // Arabic مُستفعِل
  "process", // Arabic مُفاعَلة
] as const;

export type Role = (typeof ROLES)[number];

// ═══════════════════════════════════════════════════════════════
// 4. STRUCTURAL MARKERS  (STR tokens)
// ═══════════════════════════════════════════════════════════════

export const STR_MARKERS = [
  "question", // is it / what / ?
  "negation", // not, never, no, لا
  "modal", // can, could, should, want, ابغي
  "past", // past tense marker
  "future", // will, going to, tomorrow
  "imperative", // do this / command
  "conditional", // if, unless, لو
  "cause", // because, so, لأن
  "emphasis", // إنّ / قد / لَـ — truth assertion
  "greeting", // hello, مرحبا
  "farewell", // bye, مع السلامة
] as const;

export type StrMarker = (typeof STR_MARKERS)[number];

// ═══════════════════════════════════════════════════════════════
// 5. RELATION CATEGORIES  (REL tokens)
// ═══════════════════════════════════════════════════════════════

export const RELATION_CATS = [
  "in", // spatial: in, at, within
  "on", // spatial: on, upon, على
  "to", // direction: to, toward, into
  "from", // source: from, out of
  "before", // temporal: before, prior to
  "after", // temporal: after, following
  "during", // temporal: while, during
  "until", // temporal: until, حتى
  "causes", // logical: because, therefore
  "condition", // logical: if, unless, provided
  "contrast", // logical: but, however, despite
  "and", // conjunctive: and, also, plus
  "or", // disjunctive: or, either
  "of", // possession/composition: of, 's
  "for", // purpose/beneficiary: for
  "with", // accompaniment: with, along with
  "without", // absence: without, lacking
  "like", // similarity: like, similar to
  "about", // topic: about, regarding
  "than", // comparison: than, more than
] as const;

export type RelationCat = (typeof RELATION_CATS)[number];
