#!/usr/bin/env node
/**
 * scripts/build-vocab.mjs — Regenerate per-language vocab files from concepts.json
 *
 * Usage:   node scripts/build-vocab.mjs
 * Or:      npm run vocab
 *
 * Source:  vocab/concepts.json  (EDIT THIS FILE to add new concepts)
 * Outputs: vocab/en/stems.json
 *          vocab/ar/stems.json
 *          vocab/ar/words.json   (for Arabic surface-form overrides)
 *
 * Rules:
 *   - Each concept field has `en[]` and `ar[]` arrays.
 *   - EN entries with key "stem"  → vocab/en/stems.json
 *   - AR entries with key "stem"  → vocab/ar/stems.json  (post-segmentation lookup)
 *   - AR entries with key "word"  → vocab/ar/words.json  (surface form, checked BEFORE segmentation)
 *   - A key must not appear in BOTH stems.json AND words.json (constraint 13).
 *     If a key exists in words.json, it is REMOVED from stems.json.
 *   - Existing manual entries in en/words.json are preserved (not overwritten).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const VOCAB = resolve(ROOT, "vocab");

// ── Load ─────────────────────────────────────────────────────────────────────

const concepts = JSON.parse(readFileSync(`${VOCAB}/concepts.json`, "utf-8"));

// Default gloss per field — used for AR entries that don't have their own gloss.
// Gives every Arabic ROOT token a meaningful human-readable annotation.
const FIELD_GLOSS = {
  animal: "animal, creature",
  art: "art, creative work",
  "art.book": "book, written work",
  "art.film": "film, movie",
  "art.music": "music, song",
  "art.visual": "visual art, drawing, painting",
  body: "body, physical anatomy",
  change: "change, modification",
  color: "color, shade",
  connect: "connect, link",
  contain: "contain, hold inside",
  create: "create, produce",
  decide: "decide, resolve",
  destroy: "destroy, break",
  dwell: "dwell, reside, live",
  enable: "enable, allow, turn on",
  exist: "exist, be present",
  feel: "feel, emotion",
  fight: "fight, conflict",
  fix: "fix, repair, set",
  food: "food, eat",
  "food.nutrition": "nutrition, diet, calories",
  "food.recipe": "recipe, cooking instruction",
  "food.restaurant": "restaurant, dining out",
  force: "force, pressure, power",
  gather: "gather, collect, group",
  give: "give, donate, share",
  govern: "govern, politics, authority",
  health: "health, medicine, wellbeing",
  "health.drug": "drug, medication, pharmaceutical",
  "health.fitness": "fitness, exercise, training",
  "health.symptom": "symptom, sign of illness",
  "health.treatment": "treatment, cure, therapy",
  hide: "hide, conceal",
  hold: "hold, keep, maintain",
  know: "know, learn, information",
  "know.news": "news, current events",
  "know.question": "question, inquiry",
  "know.read": "read, text, document",
  "know.search": "search, find, locate",
  make: "make, build, construct",
  material: "material, substance",
  measure: "measure, quantity, count",
  move: "move, travel, transport",
  "move.drive": "drive, car, vehicle",
  "move.fly": "fly, flight, aviation",
  "move.ride": "ride, bicycle, train",
  "move.walk": "walk, on foot",
  name: "name, person identifier",
  nature: "nature, environment",
  open: "open, unlock, start",
  person: "person, individual",
  place: "place, location",
  "place.city": "city, urban area",
  "place.country": "country, nation",
  "place.home": "home, house, residence",
  "place.route": "route, path, road",
  plant: "plant, vegetation",
  possess: "possess, own, have",
  quality: "quality, property, attribute",
  rest: "rest, sleep, relax",
  science: "science, research, discovery",
  see: "see, look, observe",
  send: "send, transmit, deliver",
  size: "size, dimension, scale",
  social: "social, community",
  "social.community": "community, group, neighborhood",
  "social.contact": "contact, colleague, friend",
  "social.family": "family, relative",
  "social.org": "organisation, institution",
  speak: "speak, communicate, say",
  "speak.command": "command, instruction",
  "speak.farewell": "farewell, goodbye",
  "speak.greeting": "greeting, hello",
  sport: "sport, athletics, competition",
  structure: "structure, framework, form",
  take: "take, get, receive",
  tech: "technology, digital, software",
  "tech.ai": "artificial intelligence, AI",
  "tech.code": "code, programming, software",
  "tech.hardware": "hardware, device, machine",
  "tech.iot": "IoT, smart device",
  "tech.network": "network, internet, connectivity",
  "tech.security": "security, privacy, protection",
  think: "think, reason, consider",
  time: "time, date, period",
  "time.alarm": "alarm, reminder, alert",
  "time.calendar": "calendar, schedule, appointment",
  "time.duration": "duration, length of time",
  trade: "trade, commerce, business",
  "trade.currency": "currency, exchange rate, money",
  "trade.order": "order, purchase, shipment",
  "trade.price": "price, cost, value",
  "trade.stock": "stock, shares, investment",
  want: "want, desire, need",
  weather: "weather, climate",
  "weather.forecast": "weather forecast",
  "weather.rain": "rain, precipitation",
  "weather.temp": "temperature, heat, cold",
  work: "work, job, task",
  write: "write, compose, record",
};

// ── Build EN stems ────────────────────────────────────────────────────────────

const enStems = {
  _comment:
    "AUTO-GENERATED from vocab/concepts.json — do not edit manually. Run: node scripts/build-vocab.mjs",
};

for (const [field, data] of Object.entries(concepts)) {
  if (field.startsWith("_")) continue;
  for (const entry of data.en || []) {
    if (!entry.stem) continue;
    const obj = { field };
    if (entry.gloss) obj.gloss = entry.gloss;
    enStems[entry.stem] = obj;
  }
}

// ── Build AR stems + AR words ─────────────────────────────────────────────────

const arStems = {
  _comment:
    "AUTO-GENERATED from vocab/concepts.json — do not edit manually. Run: node scripts/build-vocab.mjs",
};
const arWords = {
  _comment:
    "AUTO-GENERATED from vocab/concepts.json — do not edit manually. Run: node scripts/build-vocab.mjs",
};

// Track word keys so we can remove them from stems (constraint 13)
const wordKeys = new Set();

for (const [field, data] of Object.entries(concepts)) {
  if (field.startsWith("_")) continue;
  const defaultGloss = FIELD_GLOSS[field];
  for (const entry of data.ar || []) {
    const gloss = entry.gloss || defaultGloss;
    const value = gloss ? { field, gloss } : field;
    if (entry.word) {
      // Surface form → words.json (priority: checked before segmentation)
      arWords[entry.word] = value;
      wordKeys.add(entry.word);
    } else if (entry.stem) {
      // Post-segmentation stem → stems.json (only if not already in words)
      if (!wordKeys.has(entry.stem)) {
        arStems[entry.stem] = value;
      }
    }
  }
}

// Clean: if a key ended up in both (because word was added after stem), remove from stems
for (const k of wordKeys) {
  if (k in arStems) delete arStems[k];
}

// ── Write ─────────────────────────────────────────────────────────────────────

function write(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n", "utf-8");
}

write(`${VOCAB}/en/stems.json`, enStems);
write(`${VOCAB}/ar/stems.json`, arStems);
write(`${VOCAB}/ar/words.json`, arWords);

// Stats
const enCount = Object.keys(enStems).filter((k) => !k.startsWith("_")).length;
const arSCount = Object.keys(arStems).filter((k) => !k.startsWith("_")).length;
const arWCount = Object.keys(arWords).filter((k) => !k.startsWith("_")).length;

console.log(`✓ vocab/en/stems.json    ${enCount} entries`);
console.log(`✓ vocab/ar/stems.json    ${arSCount} entries`);
console.log(`✓ vocab/ar/words.json    ${arWCount} entries`);
console.log(`  Source: vocab/concepts.json`);
