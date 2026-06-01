/**
 * intent.ts — Extract structured meaning from a CST token stream.
 *
 * A CSTIntent answers: "what does this sentence MEAN and INTEND?"
 * It is derived from the flat token array, not from grammar rules.
 *
 * Algorithm (linear scan, O(n)):
 *   1.  structures   ← all STR marker values
 *   2.  entities     ← all LIT surfaces (named entities, unknowns)
 *   3.  domains      ← unique fields of ROOT tokens (deduplicated)
 *   4.  action       ← primary ROOT field (after STR:modal if present,
 *                       otherwise first ROOT, skipping STR/REL-only prefixes)
 *   5.  destination  ← ROOT/LIT immediately after REL:to
 *   6.  source       ← ROOT/LIT immediately after REL:from
 *   7.  reason       ← ROOT/LIT after STR:cause or REL:causes
 *   8.  condition    ← ROOT/LIT after STR:condition
 *   9.  agent        ← surface of ROLE:agent's preceding ROOT
 *   10. objects      ← fields of ROOT tokens that carry ROLE:patient, or
 *                       the secondary ROOTs after the action
 *   11. negated      ← true if any STR:negation present
 *   12. temporal     ← fields of time-domain ROOT tokens
 */

import type { CSTToken } from "./types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Structured meaning extracted from a CST token stream. */
export interface CSTIntent {
  /** Primary action/topic field, e.g. "move.fly", "health.treatment" */
  action: string | null;

  /**
   * Secondary objects/topics the action applies to.
   * e.g. ["trade.stock", "time.calendar"]
   */
  objects: string[];

  /** Named entities and unknown words (LIT tokens) */
  entities: string[];

  /** All sentence-structure markers: ["modal","question","negation",...] */
  structures: string[];

  /** All unique semantic fields present (sorted by occurrence) */
  domains: string[];

  /** True if STR:negation is present */
  negated: boolean;

  /** Field/surface after REL:to — destination or indirect object */
  destination: string | null;

  /** Field/surface after REL:from — source or origin */
  source: string | null;

  /** Field after STR:cause / REL:causes */
  reason: string | null;

  /** Field after STR:condition */
  condition: string | null;

  /** Time-related fields detected (time, time.alarm, time.calendar, ...) */
  temporal: string[];

  /**
   * Human-readable one-line summary of the intent.
   * Suitable for logging or LLM context injection.
   */
  summary: string;

  /** Average confidence across all non-LIT tokens */
  confidence: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** True if a field belongs to the time domain */
function isTime(field: string): boolean {
  return field === "time" || field.startsWith("time.");
}

/** Get the field or surface of the next significant token after position i */
function nextFieldOrSurface(tokens: CSTToken[], i: number): string | null {
  for (let j = i + 1; j < tokens.length; j++) {
    const t = tokens[j];
    if (t.type === "ROOT") return t.field ?? null;
    if (t.type === "LIT") return t.surface;
    // Skip ROLE, other STR/REL to find the content
  }
  return null;
}

// ── Main extractor ────────────────────────────────────────────────────────────

/**
 * extractIntent(tokens) — extract structured meaning from a CST token stream.
 *
 * @example
 * const out = tokenizeEn("I want to book a flight to London");
 * const intent = extractIntent(out.tokens);
 * // intent.action    = "move.fly"
 * // intent.structures = ["modal"]
 * // intent.destination = "London"
 * // intent.domains   = ["want", "trade", "move"]
 */
export function extractIntent(tokens: CSTToken[]): CSTIntent {
  // ── 1. Gather all structural markers ────────────────────────────────────
  const structures: string[] = [];
  for (const t of tokens) {
    if (t.type === "STR" && t.structure && !structures.includes(t.structure)) {
      structures.push(t.structure);
    }
  }

  const negated = structures.includes("negation");

  // ── 2. Gather entities (LIT) ─────────────────────────────────────────────
  const entities = tokens
    .filter((t) => t.type === "LIT" && t.surface.length > 0)
    .map((t) => t.surface);

  // ── 3. Gather domains (unique ROOT fields in order) ──────────────────────
  const domains: string[] = [];
  for (const t of tokens) {
    if (t.type === "ROOT" && t.field && !domains.includes(t.field)) {
      domains.push(t.field);
    }
  }

  // ── 4. Determine action ──────────────────────────────────────────────────
  // If STR:modal is present, action = first ROOT after the modal marker.
  // Otherwise action = first ROOT token.
  // "want" field itself is often a modal-like prefix — skip it for action.
  const skipForAction = new Set(["want", "govern"]);
  let action: string | null = null;
  let actionIdx = -1;

  const hasModal = structures.includes("modal") || domains.includes("want");

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "ROOT" || !t.field) continue;
    if (hasModal && skipForAction.has(t.field)) continue;
    action = t.field;
    actionIdx = i;
    break;
  }

  // If action is time-only (e.g. "tomorrow"), look further
  if (action && isTime(action)) {
    for (let i = actionIdx + 1; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === "ROOT" && t.field && !isTime(t.field)) {
        action = t.field;
        actionIdx = i;
        break;
      }
    }
  }

  // ── 5. Objects (ROOT fields after the action, role:patient preferred) ────
  const patientSurfaces = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === "ROLE" && tokens[i].role === "patient" && i > 0) {
      const prev = tokens[i - 1];
      if (prev.type === "ROOT" && prev.field && prev.field !== action) {
        patientSurfaces.add(prev.field);
      }
    }
  }

  const objects: string[] = [...patientSurfaces];
  // Also add secondary ROOT fields after the action that aren't in a time/entity role
  for (let i = actionIdx + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "ROOT" && t.field && t.field !== action) {
      if (
        !objects.includes(t.field) &&
        !isTime(t.field) &&
        t.field !== "want"
      ) {
        objects.push(t.field);
      }
    }
  }

  // ── 6. Destination (after REL:to) ────────────────────────────────────────
  let destination: string | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "REL" && t.relation === "to") {
      destination = nextFieldOrSurface(tokens, i);
      break;
    }
  }

  // ── 7. Source (after REL:from) ───────────────────────────────────────────
  let source: string | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "REL" && t.relation === "from") {
      source = nextFieldOrSurface(tokens, i);
      break;
    }
  }

  // ── 8. Reason (after STR:cause or REL:causes) ────────────────────────────
  let reason: string | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (
      (t.type === "STR" && t.structure === "cause") ||
      (t.type === "REL" && t.relation === "causes")
    ) {
      reason = nextFieldOrSurface(tokens, i);
      break;
    }
  }

  // ── 9. Condition (after STR:condition) ───────────────────────────────────
  let condition: string | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "STR" && t.structure === "condition") {
      condition = nextFieldOrSurface(tokens, i);
      break;
    }
  }

  // ── 10. Temporal fields ──────────────────────────────────────────────────
  const temporal = domains.filter(isTime);

  // ── 11. Confidence ───────────────────────────────────────────────────────
  const classifiedTokens = tokens.filter(
    (t) => t.type !== "LIT" && t.type !== "ROLE",
  );
  const confidence =
    classifiedTokens.length > 0
      ? classifiedTokens.reduce((s, t) => s + t.confidence, 0) /
        classifiedTokens.length
      : 0;

  // ── 12. Summary string ───────────────────────────────────────────────────
  const summaryParts: string[] = [];
  if (structures.length) summaryParts.push(`[${structures.join("+")}]`);
  if (negated) summaryParts.push("NOT");
  if (action) summaryParts.push(action);
  if (objects.length) summaryParts.push(`→ ${objects.join(", ")}`);
  if (destination) summaryParts.push(`TO:${destination}`);
  if (source) summaryParts.push(`FROM:${source}`);
  if (reason) summaryParts.push(`BECAUSE:${reason}`);
  if (condition) summaryParts.push(`IF:${condition}`);
  if (entities.length) summaryParts.push(`{${entities.join(", ")}}`);

  const summary = summaryParts.join(" ") || "(no structured intent detected)";

  return {
    action,
    objects,
    entities,
    structures,
    domains,
    negated,
    destination,
    source,
    reason,
    condition,
    temporal,
    summary,
    confidence: Math.round(confidence * 100) / 100,
  };
}
