#!/usr/bin/env node
/**
 * scripts/expand-ar-vocab.mjs — Generate Arabic vocab candidates from
 * plan/Roots_permutations.csv.
 *
 * Usage:
 *   node scripts/expand-ar-vocab.mjs            # dry-run: writes plan/results/
 *   node scripts/expand-ar-vocab.mjs --apply    # merge approved.json → concepts.json
 *
 * Outputs (plan/results/):
 *   ar-approved.json   — high-confidence entries (≥ 0.75), safe to auto-merge
 *   ar-review.json     — medium-confidence (0.45–0.74), needs human review
 *   ar-skipped.json    — already in vocab or below threshold
 *
 * Strategy:
 *   1. Parse CSV → extract unique (FORM_ar, GLOSS) pairs (normalized).
 *   2. Skip forms already in vocab/ar/stems.json or vocab/ar/words.json.
 *   3. Score each form: for each GLOSS segment, look up keyword table → field.
 *      Confidence = (matching keywords / total keywords) within top-1 field.
 *   4. ≥ 0.75 → approved, 0.45–0.74 → review, < 0.45 → skip.
 *   5. --apply writes approved stems into vocab/concepts.json under the correct field.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createReadStream } from "node:fs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const RESULTS_DIR = resolve(ROOT, "plan/results");
const APPLY = process.argv.includes("--apply");

// ── Gloss → CST field keyword table ─────────────────────────────────────────
// Each key is a CST field; value is an array of English gloss keywords.
// Order matters: more specific fields first (sub-fields before parents).

const FIELD_KEYWORDS = {
  // ── Knowledge / cognition ─────────────────────────────────────────────
  know: [
    "know",
    "knowledge",
    "learn",
    "understand",
    "cognit",
    "aware",
    "perceive",
    "recognize",
    "remember",
    "recall",
    "comprehend",
    "discover",
    "educate",
    "inform",
    "clarify",
    "explain",
    "study",
    "research",
    "investigate",
    "examine",
    "realize",
    "verify",
    "confirm",
    "read",
    "inform",
    "instruct",
    "teach",
    "wisdom",
    "inform",
    "expertise",
    "science",
    "facts",
    "data",
  ],
  think: [
    "think",
    "consider",
    "reflect",
    "ponder",
    "contemplate",
    "believe",
    "suppose",
    "assume",
    "imagine",
    "speculate",
    "reason",
    "deduce",
    "plan",
    "intend",
    "deliberate",
    "evaluate",
    "judge",
    "assess",
    "weigh",
    "opine",
  ],

  // ── Communication ─────────────────────────────────────────────────────
  speak: [
    "speak",
    "say",
    "tell",
    "utter",
    "voice",
    "announce",
    "declare",
    "state",
    "express",
    "communicate",
    "converse",
    "mention",
    "report",
    "claim",
    "argue",
    "address",
    "call",
    "shout",
    "whisper",
    "respond",
    "reply",
    "answer",
    "narrate",
    "describe",
    "recite",
    "repeat",
    "quote",
    "pronounce",
    "articulate",
    "translate",
    "interpret",
  ],
  write: [
    "write",
    "record",
    "inscribe",
    "document",
    "compose",
    "draft",
    "publish",
    "edit",
    "print",
    "transcribe",
    "chronicle",
    "note",
    "list",
    "enumerate",
    "register",
    "compile",
    "author",
    "script",
    "sign",
    "draw up",
  ],

  // ── Movement / transport ──────────────────────────────────────────────
  move: [
    "move",
    "go",
    "travel",
    "walk",
    "run",
    "journey",
    "proceed",
    "advance",
    "approach",
    "flee",
    "escape",
    "rush",
    "hurry",
    "hasten",
    "depart",
    "arrive",
    "return",
    "come",
    "enter",
    "exit",
    "descend",
    "ascend",
    "climb",
    "fall",
    "rise",
    "flow",
    "drift",
    "wander",
    "migrate",
    "cross",
    "pass",
    "reach",
    "leave",
    "withdraw",
    "retreat",
    "spread",
    "scatter",
    "disperse",
    "circulate",
    "rotate",
    "spin",
    "turn",
  ],

  // ── Transfer / giving ─────────────────────────────────────────────────
  give: [
    "give",
    "grant",
    "donate",
    "offer",
    "bestow",
    "present",
    "provide",
    "supply",
    "transfer",
    "assign",
    "deliver",
    "hand",
    "yield",
    "surrender",
    "award",
    "contribute",
    "share",
    "distribute",
    "allocate",
    "lend",
    "extend",
  ],
  take: [
    "take",
    "grab",
    "receive",
    "get",
    "obtain",
    "acquire",
    "seize",
    "capture",
    "collect",
    "gather",
    "extract",
    "pick",
    "choose",
    "select",
    "adopt",
    "accept",
    "inherit",
    "consume",
    "eat",
    "drink",
    "absorb",
    "borrow",
    "steal",
    "confiscate",
  ],
  send: [
    "send",
    "transmit",
    "deliver",
    "dispatch",
    "convey",
    "forward",
    "post",
    "emit",
    "broadcast",
    "publish",
    "release",
    "launch",
    "throw",
    "cast",
    "project",
    "shoot",
    "export",
    "upload",
    "transfer",
  ],

  // ── Creation / making ─────────────────────────────────────────────────
  create: [
    "create",
    "make",
    "build",
    "construct",
    "produce",
    "form",
    "establish",
    "found",
    "originate",
    "generate",
    "design",
    "develop",
    "invent",
    "compose",
    "manufacture",
    "craft",
    "sculpt",
    "carve",
    "weave",
    "knit",
    "assemble",
    "arrange",
    "prepare",
    "cook",
    "brew",
    "plant",
    "grow",
    "cultivate",
    "raise",
    "breed",
  ],
  fix: [
    "fix",
    "repair",
    "restore",
    "correct",
    "adjust",
    "improve",
    "reform",
    "renovate",
    "mend",
    "heal",
    "cure",
    "treat",
    "remedy",
    "resolve",
    "solve",
    "settle",
    "reconcile",
    "compensate",
    "return to",
    "set right",
    "complete",
    "fulfill",
    "purify",
  ],
  destroy: [
    "destroy",
    "break",
    "ruin",
    "demolish",
    "damage",
    "harm",
    "hurt",
    "wound",
    "injure",
    "kill",
    "slay",
    "cut",
    "tear",
    "burn",
    "melt",
    "dissolve",
    "eliminate",
    "remove",
    "erase",
    "abolish",
    "defeat",
    "conquer",
    "overcome",
    "oppress",
    "exhaust",
    "consume",
    "expend",
    "waste",
    "exhaust",
    "scatter",
    "disperse",
    "defeat",
  ],
  change: [
    "change",
    "transform",
    "alter",
    "convert",
    "turn",
    "shift",
    "switch",
    "replace",
    "exchange",
    "substitute",
    "modify",
    "adapt",
    "adjust",
    "revise",
    "update",
    "renew",
    "translate",
    "transfer",
    "move",
    "deviate",
    "diverge",
    "vary",
    "differ",
  ],

  // ── Support / holding ────────────────────────────────────────────────
  hold: [
    "hold",
    "carry",
    "bear",
    "support",
    "sustain",
    "maintain",
    "keep",
    "preserve",
    "protect",
    "guard",
    "defend",
    "save",
    "secure",
    "store",
    "retain",
    "contain",
    "cover",
    "wrap",
    "surround",
    "bind",
    "tie",
    "attach",
    "connect",
    "link",
  ],
  open: [
    "open",
    "reveal",
    "uncover",
    "expose",
    "disclose",
    "show",
    "display",
    "present",
    "release",
    "free",
    "liberate",
    "unlock",
    "unfold",
    "expand",
    "spread",
    "start",
    "begin",
    "commence",
    "launch",
    "initiate",
    "introduce",
  ],
  hide: [
    "hide",
    "conceal",
    "cover",
    "veil",
    "mask",
    "obscure",
    "bury",
    "suppress",
    "withhold",
    "keep secret",
    "disguise",
    "camouflage",
    "shadow",
    "block",
    "close",
    "shut",
    "lock",
    "seal",
    "protect",
    "guard",
  ],

  // ── Social / human relations ──────────────────────────────────────────
  social: [
    "social",
    "meet",
    "gather",
    "community",
    "people",
    "group",
    "tribe",
    "nation",
    "family",
    "friend",
    "companion",
    "associate",
    "cooperate",
    "unite",
    "join",
    "assemble",
    "crowd",
    "company",
    "society",
    "fellowship",
    "brotherhood",
    "relative",
    "neighbor",
    "guest",
    "host",
    "stranger",
    "enemy",
    "ally",
    "marriage",
    "wedding",
    "divorce",
    "birth",
    "death",
    "funeral",
    "celebration",
    "love",
    "hate",
    "friendship",
    "enmity",
    "peace",
    "conflict",
    "honor",
    "shame",
    "religion",
    "pray",
    "worship",
    "god",
    "faith",
    "belief",
    "piety",
    "ritual",
    "islam",
    "muslim",
    "christian",
    "jew",
    "prayer",
    "mosque",
    "church",
    "temple",
    "praise",
    "glorify",
    "bless",
    "sanctify",
    "sin",
    "repent",
    "forgive",
    "mercy",
  ],

  // ── Governance / authority ────────────────────────────────────────────
  govern: [
    "govern",
    "rule",
    "manage",
    "administer",
    "control",
    "lead",
    "command",
    "order",
    "judge",
    "decide",
    "arbitrate",
    "legislate",
    "regulate",
    "supervise",
    "oversee",
    "authority",
    "power",
    "dominion",
    "kingdom",
    "state",
    "government",
    "policy",
    "law",
    "justice",
    "court",
    "trial",
    "punish",
    "reward",
    "tax",
    "levy",
    "appoint",
    "elect",
    "vote",
    "represent",
    "delegate",
    "minister",
    "official",
  ],

  // ── Conflict / force ──────────────────────────────────────────────────
  fight: [
    "fight",
    "war",
    "battle",
    "conflict",
    "attack",
    "strike",
    "hit",
    "beat",
    "assault",
    "resist",
    "defend",
    "oppose",
    "compete",
    "contest",
    "struggle",
    "wrestle",
    "force",
    "compel",
    "coerce",
    "threaten",
    "intimidate",
    "conquer",
    "defeat",
    "kill",
    "wound",
    "harm",
    "destroy",
    "siege",
    "capture",
    "imprison",
    "punish",
    "pursue",
    "chase",
    "hunt",
    "ambush",
    "ambush",
    "raid",
    "invade",
    "occupy",
  ],

  // ── Commerce / trade ─────────────────────────────────────────────────
  trade: [
    "trade",
    "buy",
    "sell",
    "commerce",
    "market",
    "exchange",
    "barter",
    "negotiate",
    "deal",
    "transaction",
    "profit",
    "loss",
    "price",
    "cost",
    "pay",
    "spend",
    "invest",
    "earn",
    "owe",
    "debt",
    "credit",
    "wealth",
    "money",
    "currency",
    "bank",
    "loan",
    "mortgage",
    "hire",
    "rent",
    "lease",
    "contract",
    "agreement",
  ],

  // ── Work / profession ─────────────────────────────────────────────────
  work: [
    "work",
    "labor",
    "employ",
    "job",
    "profession",
    "occupation",
    "task",
    "duty",
    "effort",
    "strive",
    "toil",
    "produce",
    "operate",
    "function",
    "perform",
    "serve",
    "practice",
    "exercise",
    "train",
    "discipline",
    "skill",
    "craft",
    "art",
    "finish",
    "complete",
    "accomplish",
    "achieve",
    "success",
    "fail",
  ],

  // ── Possessing / owning ───────────────────────────────────────────────
  possess: [
    "possess",
    "own",
    "have",
    "belong",
    "inherit",
    "acquire",
    "keep",
    "retain",
    "property",
    "wealth",
    "asset",
    "resource",
    "share",
    "portion",
    "part",
    "store",
    "stock",
    "reserve",
    "supply",
    "abundance",
    "lack",
    "poverty",
  ],

  // ── Health / body ────────────────────────────────────────────────────
  health: [
    "health",
    "sick",
    "ill",
    "disease",
    "medicine",
    "treat",
    "cure",
    "heal",
    "recover",
    "pain",
    "suffer",
    "symptom",
    "infection",
    "fever",
    "injury",
    "wound",
    "surgery",
    "doctor",
    "hospital",
    "drug",
    "remedy",
    "therapy",
    "prevention",
    "hygiene",
  ],
  body: [
    "body",
    "limb",
    "organ",
    "head",
    "face",
    "eye",
    "ear",
    "nose",
    "mouth",
    "hand",
    "foot",
    "arm",
    "leg",
    "neck",
    "chest",
    "back",
    "skin",
    "bone",
    "blood",
    "heart",
    "brain",
    "breath",
    "voice",
    "hair",
    "tooth",
    "physical",
    "flesh",
    "muscle",
  ],

  // ── Food / sustenance ─────────────────────────────────────────────────
  food: [
    "eat",
    "food",
    "drink",
    "consume",
    "feed",
    "nourish",
    "taste",
    "swallow",
    "hunger",
    "thirst",
    "meal",
    "feast",
    "fast",
    "cook",
    "bake",
    "prepare",
    "serve",
    "fruit",
    "vegetable",
    "meat",
    "bread",
    "water",
    "milk",
    "oil",
    "sweet",
    "salt",
  ],

  // ── Nature / environment ──────────────────────────────────────────────
  nature: [
    "nature",
    "environment",
    "earth",
    "land",
    "water",
    "sea",
    "river",
    "mountain",
    "desert",
    "forest",
    "plant",
    "tree",
    "flower",
    "grass",
    "stone",
    "soil",
    "dust",
    "fire",
    "wind",
    "cloud",
    "rain",
    "sun",
    "moon",
    "star",
    "sky",
    "air",
    "light",
    "dark",
    "hot",
    "cold",
    "wet",
    "dry",
    "season",
    "climate",
    "weather",
  ],
  animal: [
    "animal",
    "creature",
    "beast",
    "bird",
    "fish",
    "insect",
    "livestock",
    "cattle",
    "horse",
    "camel",
    "sheep",
    "goat",
    "dog",
    "cat",
    "lion",
    "wolf",
    "snake",
    "fly",
    "graze",
    "hunt",
    "tame",
    "wild",
    "herd",
    "flock",
    "swarm",
  ],

  // ── Art / culture ─────────────────────────────────────────────────────
  art: [
    "art",
    "music",
    "paint",
    "draw",
    "craft",
    "create",
    "design",
    "beauty",
    "decorate",
    "poem",
    "song",
    "story",
    "narrative",
    "fiction",
    "drama",
    "theater",
    "dance",
    "image",
    "picture",
    "sculpture",
    "monument",
    "architecture",
    "ornament",
  ],

  // ── Sensory / perception ──────────────────────────────────────────────
  see: [
    "see",
    "look",
    "watch",
    "observe",
    "view",
    "glance",
    "notice",
    "witness",
    "sight",
    "visible",
    "shine",
    "appear",
    "disappear",
    "show",
    "display",
    "reveal",
    "bright",
    "illuminate",
    "light",
    "dark",
    "shadow",
    "reflect",
    "shine",
  ],
  feel: [
    "feel",
    "emotion",
    "sense",
    "sentiment",
    "mood",
    "joy",
    "happy",
    "sad",
    "grief",
    "sorrow",
    "fear",
    "anger",
    "love",
    "passion",
    "desire",
    "longing",
    "hope",
    "despair",
    "comfort",
    "pain",
    "pleasure",
    "suffer",
    "enjoy",
    "excitement",
    "calm",
    "worry",
    "regret",
    "shame",
    "pride",
    "envy",
    "jealous",
    "sympathize",
    "pity",
  ],

  // ── Time ─────────────────────────────────────────────────────────────
  time: [
    "time",
    "when",
    "moment",
    "period",
    "date",
    "duration",
    "instant",
    "age",
    "era",
    "past",
    "present",
    "future",
    "before",
    "after",
    "early",
    "late",
    "soon",
    "long",
    "short",
    "day",
    "night",
    "morning",
    "evening",
    "week",
    "month",
    "year",
    "century",
    "always",
    "never",
    "sometimes",
    "often",
    "delay",
    "hasten",
    "expire",
    "begin",
    "end",
  ],

  // ── Place / location ─────────────────────────────────────────────────
  place: [
    "place",
    "location",
    "space",
    "where",
    "area",
    "region",
    "zone",
    "territory",
    "country",
    "city",
    "village",
    "home",
    "house",
    "building",
    "room",
    "street",
    "path",
    "road",
    "direction",
    "distance",
    "near",
    "far",
    "inside",
    "outside",
    "above",
    "below",
    "left",
    "right",
    "front",
    "back",
    "center",
    "border",
    "edge",
  ],

  // ── Existence / state ─────────────────────────────────────────────────
  exist: [
    "exist",
    "be",
    "remain",
    "stay",
    "continue",
    "persist",
    "last",
    "endure",
    "survive",
    "appear",
    "presence",
    "absence",
    "emerge",
    "vanish",
    "occur",
    "happen",
    "take place",
    "live",
    "die",
    "begin",
    "end",
    "start",
    "stop",
    "become",
    "turn into",
  ],

  // ── Size / quantity ───────────────────────────────────────────────────
  size: [
    "big",
    "large",
    "small",
    "little",
    "tall",
    "short",
    "long",
    "wide",
    "narrow",
    "thick",
    "thin",
    "heavy",
    "light",
    "deep",
    "shallow",
    "full",
    "empty",
    "increase",
    "decrease",
    "grow",
    "shrink",
    "expand",
    "contract",
    "extend",
    "amount",
    "quantity",
    "number",
    "count",
    "measure",
    "limit",
    "exceed",
  ],
  quality: [
    "good",
    "bad",
    "right",
    "wrong",
    "true",
    "false",
    "pure",
    "clean",
    "dirty",
    "strong",
    "weak",
    "hard",
    "soft",
    "fast",
    "slow",
    "loud",
    "quiet",
    "clear",
    "obscure",
    "beautiful",
    "ugly",
    "rich",
    "poor",
    "noble",
    "humble",
    "brave",
    "coward",
    "honest",
    "liar",
    "just",
    "unjust",
    "kind",
    "cruel",
    "wise",
    "foolish",
    "complete",
    "incomplete",
    "perfect",
    "deficient",
    "valid",
    "invalid",
  ],
};

// Compute a reverse index: keyword → [field, ...]
const KEYWORD_INDEX = new Map();
for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
  for (const kw of keywords) {
    if (!KEYWORD_INDEX.has(kw)) KEYWORD_INDEX.set(kw, []);
    KEYWORD_INDEX.get(kw).push(field);
  }
}

// ── Normalization (same as tokenizer/ar.ts) ──────────────────────────────────

function normalizeAr(text) {
  let s = text
    .replace(/[\u064B-\u065F\u0670]/g, "") // diacritics
    .replace(/\u0640/g, ""); // tatweel
  s = s.replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627"); // alef variants → ا
  s = s.replace(/\u0649/g, "\u064A"); // ى → ي
  s = s.replace(/\u0624/g, "\u0648"); // ؤ → و
  s = s.replace(/\u0629/g, "\u0647"); // ة → ه
  return s;
}

// ── Field scoring ─────────────────────────────────────────────────────────────

function scoreGloss(glossRaw) {
  // GLOSS may be "desire;aspire" — split on ; and space
  const tokens = glossRaw
    .toLowerCase()
    .split(/[;,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const scores = {};
  let matched = 0;
  for (const token of tokens) {
    const fields = KEYWORD_INDEX.get(token);
    if (fields) {
      matched++;
      for (const f of fields) {
        scores[f] = (scores[f] || 0) + 1;
      }
    }
  }
  if (Object.keys(scores).length === 0) return null;

  // Pick top field
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topField, topScore] = sorted[0];
  const confidence = topScore / Math.max(tokens.length, 1);
  return { field: topField, confidence, matched, total: tokens.length };
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("Loading existing vocab…");
const existingStems = new Set(
  Object.keys(
    JSON.parse(readFileSync(resolve(ROOT, "vocab/ar/stems.json"), "utf-8")),
  ).filter((k) => !k.startsWith("_")),
);
const existingWords = new Set(
  Object.keys(
    JSON.parse(readFileSync(resolve(ROOT, "vocab/ar/words.json"), "utf-8")),
  ).filter((k) => !k.startsWith("_")),
);
const existingAll = new Set([...existingStems, ...existingWords]);

console.log(`  Existing stems: ${existingStems.size}`);
console.log(`  Existing words: ${existingWords.size}`);

console.log("Parsing CSV…");

// Group by normalized FORM_ar — collect all gloss segments per form
const formGlosses = new Map(); // normForm → { raw, glosses: Set }
const lineReader = readFileSync(
  resolve(ROOT, "plan/Roots_permutations.csv"),
  "utf-8",
).split("\n");
const headers = lineReader[0].split(",");
const colForm = headers.indexOf("FORM_ar");
const colGloss = headers.indexOf("GLOSS");
const colPos = headers.indexOf("POS_NICE");

for (let i = 1; i < lineReader.length; i++) {
  const line = lineReader[i].trim();
  if (!line) continue;
  // Simple split — GLOSS doesn't contain commas (it uses semicolons)
  const cols = line.split(",");
  const formRaw = cols[colForm]?.trim();
  const glossRaw = cols[colGloss]?.trim();
  const pos = cols[colPos]?.trim() ?? "";
  if (!formRaw || !glossRaw) continue;
  // Skip proper nouns
  if (pos === "Proper noun") continue;

  const normForm = normalizeAr(formRaw);
  // Require at least 3 chars (2-char forms are almost always clitics/fragments)
  if (normForm.length < 3) continue;
  // Skip forms that are purely structural letters with no root consonants
  if (/^[اويه]+$/.test(normForm)) continue;

  if (!formGlosses.has(normForm)) {
    formGlosses.set(normForm, { raw: formRaw, glosses: new Set() });
  }
  for (const g of glossRaw.split(";")) {
    formGlosses.get(normForm).glosses.add(g.trim().toLowerCase());
  }
}

console.log(`  Unique normalized forms in CSV: ${formGlosses.size}`);

// Score each form
const approved = [];
const review = [];
let skippedExisting = 0;
let skippedLow = 0;

for (const [normForm, { raw, glosses }] of formGlosses) {
  if (existingAll.has(normForm)) {
    skippedExisting++;
    continue;
  }
  const combinedGloss = [...glosses].join(";");
  const result = scoreGloss(combinedGloss);
  if (!result) {
    skippedLow++;
    continue;
  }
  const entry = {
    stem: normForm,
    gloss: combinedGloss,
    field: result.field,
    confidence: parseFloat(result.confidence.toFixed(3)),
  };
  if (result.confidence >= 0.75) {
    approved.push(entry);
  } else if (result.confidence >= 0.45) {
    review.push(entry);
  } else {
    skippedLow++;
  }
}

// Sort by confidence desc
approved.sort((a, b) => b.confidence - a.confidence);
review.sort((a, b) => b.confidence - a.confidence);

// ── Write results ─────────────────────────────────────────────────────────────

if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

writeFileSync(
  resolve(RESULTS_DIR, "ar-approved.json"),
  JSON.stringify(approved, null, 2),
  "utf-8",
);
writeFileSync(
  resolve(RESULTS_DIR, "ar-review.json"),
  JSON.stringify(review, null, 2),
  "utf-8",
);

console.log("\n── Results ──────────────────────────────────────────────────");
console.log(`  Approved (≥0.75):  ${approved.length} entries`);
console.log(`  Review  (0.45–0.74): ${review.length} entries`);
console.log(`  Skipped (already in vocab): ${skippedExisting}`);
console.log(`  Skipped (low confidence): ${skippedLow}`);
console.log(`\n  Output: plan/results/ar-approved.json`);
console.log(`          plan/results/ar-review.json`);

// Field distribution
const fieldCounts = {};
for (const e of approved)
  fieldCounts[e.field] = (fieldCounts[e.field] || 0) + 1;
const sorted = Object.entries(fieldCounts).sort((a, b) => b[1] - a[1]);
console.log("\n  Field distribution (approved):");
for (const [f, c] of sorted.slice(0, 15)) {
  console.log(`    ${f.padEnd(20)} ${c}`);
}

// ── Apply ─────────────────────────────────────────────────────────────────────

if (APPLY) {
  console.log("\n── Applying approved entries to vocab/concepts.json…");
  const conceptsPath = resolve(ROOT, "vocab/concepts.json");
  const concepts = JSON.parse(readFileSync(conceptsPath, "utf-8"));

  let added = 0;
  for (const entry of approved) {
    const { field, stem, gloss } = entry;
    if (!concepts[field]) {
      console.warn(`  Unknown field: ${field} — skipping ${stem}`);
      continue;
    }
    const arList = concepts[field].ar;
    const alreadyThere = arList.some((e) => (e.stem || e.word) === stem);
    if (alreadyThere) continue;
    arList.push({ stem, gloss });
    added++;
  }

  writeFileSync(conceptsPath, JSON.stringify(concepts, null, 2), "utf-8");
  console.log(`  Added ${added} new stems to concepts.json`);
  console.log("  Run: npm run vocab && npm run build && npm test");
} else {
  console.log(
    "\n  Dry run complete. Run with --apply to merge approved entries.",
  );
}
