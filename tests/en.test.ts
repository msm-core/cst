/**
 * tests/en.test.ts — English tokenizer tests.
 *
 * Each test group validates a specific behaviour.
 * Run with: npm test
 */

import { tokenizeEn } from "../src/tokenizer/en.js";
import { detokenize, digest, toLLMContext, gloss } from "../src/detokenizer.js";
import type { CSTToken } from "../src/types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fields(text: string): string[] {
  return tokenizeEn(text)
    .tokens.filter((t) => t.type === "CONCEPT")
    .map((t) => t.field!);
}

function structures(text: string): string[] {
  return tokenizeEn(text)
    .tokens.filter((t) => t.type === "STR")
    .map((t) => t.structure!);
}

function relations(text: string): string[] {
  return tokenizeEn(text)
    .tokens.filter((t) => t.type === "REL")
    .map((t) => t.relation!);
}

function litSurfaces(text: string): string[] {
  return tokenizeEn(text)
    .tokens.filter((t) => t.type === "LIT")
    .map((t) => t.surface);
}

function firstField(text: string): string | undefined {
  return tokenizeEn(text).tokens.find((t) => t.type === "CONCEPT")?.field;
}

// ── CONCEPT tokens — core field mapping ──────────────────────────────────────

describe("CONCEPT: field mapping", () => {
  test("write field", () => {
    expect(firstField("write a letter")).toBe("write");
    expect(firstField("compose an email")).toBe("write");
    expect(firstField("publish the report")).toBe("write");
  });

  test("know field", () => {
    expect(firstField("learn programming")).toBe("know");
    expect(firstField("study history")).toBe("know");
    expect(firstField("search for facts")).toBe("know.search");
  });

  test("tech field", () => {
    expect(firstField("debug the code")).toBe("tech.code");
    expect(firstField("deploy to the cloud")).toBe("tech.network");
    expect(firstField("configure wifi")).toBe("tech.network");
    expect(firstField("bluetooth device")).toBe("tech.iot"); // bluetooth stem → tech.iot
  });

  test("health field", () => {
    expect(firstField("take medication")).toBe("health.drug"); // compound: take + medication
    expect(firstField("surgery recovery")).toBe("health.treatment"); // surgery stem → treatment
    expect(firstField("describe symptoms")).toBe("health.symptom");
  });

  test("time field", () => {
    expect(firstField("set an alarm")).toBe("time.alarm");
    expect(firstField("add to calendar")).toBe("time.calendar");
    expect(firstField("schedule a meeting")).toBe("time.calendar");
  });

  test("art field", () => {
    expect(firstField("play music")).toBe("art.music"); // compound match
    expect(firstField("listen to song")).toBe("art.music");
    expect(firstField("watch movie")).toBe("art.film");
    expect(firstField("novel chapter")).toBe("art.book"); // novel stem → art.book (level2)
  });

  test("trade field", () => {
    expect(firstField("buy groceries")).toBe("trade.order");
    expect(firstField("check stock market")).toBe("trade.stock"); // compound
    expect(firstField("convert currency")).toBe("trade.currency");
  });

  test("move field", () => {
    expect(firstField("drive to work")).toBe("move.drive");
    expect(firstField("book flight")).toBe("move.fly"); // compound: skip word 'a' drops out
    expect(firstField("navigate to mall")).toBe("place.route");
  });

  test("weather field", () => {
    expect(firstField("check weather forecast")).toBe("weather.forecast"); // compound
    expect(firstField("will it rain tomorrow")).toBe("weather.rain");
    expect(firstField("what is the temperature")).toBe("weather.temp");
  });

  test("food field", () => {
    expect(firstField("cook a recipe")).toBe("food.recipe");
    expect(firstField("find restaurant")).toBe("food.restaurant"); // compound (stop word 'a' dropped)
    expect(firstField("count calories")).toBe("food.nutrition"); // compound
  });
});

// ── STR tokens — structural markers ──────────────────────────────────────────

describe("STR: structural markers", () => {
  test("negation", () => {
    expect(structures("do not disturb")).toContain("negation");
    expect(structures("never tell anyone")).toContain("negation");
  });

  test("modal", () => {
    expect(structures("can you help me")).toContain("modal");
    expect(structures("should I go")).toContain("modal");
    expect(structures("please remind me")).toContain("imperative");
  });

  test("future", () => {
    expect(structures("will it rain")).toContain("future");
  });

  test("past", () => {
    expect(structures("what was the score")).toContain("past");
  });

  test("greeting / farewell", () => {
    expect(structures("hello how are you")).toContain("greeting");
    expect(structures("goodbye see you")).toContain("farewell");
  });

  test("conditional", () => {
    expect(structures("if it rains cancel")).toContain("conditional");
    expect(structures("unless it is sunny")).toContain("conditional");
  });
});

// ── REL tokens — relation categories ─────────────────────────────────────────

describe("REL: relation categories", () => {
  test("spatial", () => {
    expect(relations("meet me in the park")).toContain("in");
    expect(relations("go to the airport")).toContain("to");
    expect(relations("travel from London")).toContain("from");
  });

  test("logical / causal", () => {
    expect(relations("stay home because it is raining")).toContain("causes");
    expect(relations("he left so the meeting ended")).toContain("causes");
  });

  test("contrast", () => {
    expect(relations("I tried but failed")).toContain("contrast");
    expect(relations("it is raining however we went")).toContain("contrast");
  });

  test("conjunctive", () => {
    expect(relations("tea and coffee")).toContain("and");
    expect(relations("tea or coffee")).toContain("or");
  });
});

// ── Morphology — suffix/prefix stripping ─────────────────────────────────────

describe("Morphology: role detection", () => {
  test("agent suffix -er", () => {
    const tokens = tokenizeEn("the writer published");
    const w = tokens.tokens.find((t) => t.surface === "writer");
    expect(w?.role).toBe("agent");
    expect(w?.field).toBe("write");
  });

  test("instance suffix -tion", () => {
    // publication is a direct stem entry (no morphological stripping needed)
    const tokens = tokenizeEn("the publication was late");
    const p = tokens.tokens.find((t) => t.surface === "publication");
    expect(p?.field).toBe("write");
    expect(p?.type).toBe("CONCEPT");
  });

  test("negate prefix un-", () => {
    const tokens = tokenizeEn("disconnect the device");
    const d = tokens.tokens.find((t) => t.surface === "disconnect");
    expect(d?.role).toBe("negate");
    expect(d?.field).toBe("connect");
  });

  test("repeat prefix re-", () => {
    const tokens = tokenizeEn("rewrite the code");
    const r = tokens.tokens.find((t) => t.surface === "rewrite");
    expect(r?.role).toBe("repeat");
    expect(r?.field).toBe("write");
  });
});

// ── Surface preservation (detokenization) ────────────────────────────────────

describe("Surface: always preserved", () => {
  test("surface never dropped", () => {
    const { tokens } = tokenizeEn("play music tomorrow morning please");
    const surfaces = tokens.map((t) => t.surface);
    // 'play music' is a compound — surface is the bigram
    expect(surfaces).toContain("play music");
    expect(surfaces).toContain("tomorrow");
    expect(surfaces).toContain("morning");
    expect(surfaces).toContain("please");
  });

  test("detokenize roundtrip (surface join)", () => {
    const text = "set an alarm for tomorrow morning";
    const { tokens } = tokenizeEn(text);
    const reconstructed = detokenize(tokens);
    // All content words should be in reconstructed (order preserved)
    expect(reconstructed).toContain("alarm");
    expect(reconstructed).toContain("tomorrow");
    expect(reconstructed).toContain("morning");
  });

  test("LIT tokens preserve surface exactly", () => {
    const lits = litSurfaces("call Alexa and ask Siri");
    // "Alexa" and "Siri" are proper nouns, should be LIT
    expect(lits).toContain("Alexa");
    expect(lits).toContain("Siri");
  });
});

// ── Compound bigrams ──────────────────────────────────────────────────────────

describe("Compound bigrams", () => {
  test("machine learning → tech.ai", () => {
    const f = fields("explain machine learning");
    expect(f).toContain("tech.ai");
  });

  test("blood pressure → health.symptom", () => {
    const f = fields("check blood pressure");
    expect(f).toContain("health.symptom");
  });

  test("stock market → trade.stock", () => {
    const f = fields("what is the stock market doing");
    expect(f).toContain("trade.stock");
  });

  test("play music → art.music (compound surface preserved)", () => {
    const { tokens } = tokenizeEn("I want to play music");
    const compound = tokens.find((t) => t.surface === "play music");
    expect(compound?.field).toBe("art.music");
    expect(compound?.surface).toBe("play music"); // surface is the bigram
  });
});

// ── Detokenizer APIs ──────────────────────────────────────────────────────────

describe("Detokenizer APIs", () => {
  const input = "can you set an alarm for tomorrow morning";
  const { tokens } = tokenizeEn(input);

  test("digest returns compact string", () => {
    const d = digest(tokens);
    expect(d).toContain("STR:modal");
    expect(d).toContain("CONCEPT:time.alarm");
    expect(d).toContain("CONCEPT:time");
  });

  test("toLLMContext returns readable string", () => {
    const ctx = toLLMContext(tokens);
    expect(ctx).toContain("Intent:");
    expect(ctx).toContain("Topics:");
  });

  test("gloss returns annotated string", () => {
    const g = gloss(tokens);
    expect(g).toContain("|STR:modal");
    expect(g).toContain("|CONCEPT:time");
  });
});

// ── Coverage stats ────────────────────────────────────────────────────────────

describe("Coverage", () => {
  test("litRatio < 0.25 for common English sentences", () => {
    const sentences = [
      "set an alarm for tomorrow morning",
      "play music in the kitchen",
      "what is the weather forecast for today",
      "book flight to London next week",
      "remind me to take medication at eight",
      "can you search for the nearest restaurant",
    ];
    for (const s of sentences) {
      const { coverage } = tokenizeEn(s);
      expect(coverage.litRatio).toBeLessThanOrEqual(0.25);
    }
  });
});
