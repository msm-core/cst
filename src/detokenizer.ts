/**
 * detokenizer.ts — Reconstruct text from a CST token stream.
 *
 * Three modes:
 *
 *   detokenize(tokens)     → exact original text (joins surfaces by space)
 *   digest(tokens)         → compact semantic string for logging/debugging
 *   toLLMContext(tokens)   → natural-language string to inject before LLM prompt
 */

import type { CSTToken } from "./types.js";

// ── 1. detokenize — exact reconstruction from surfaces ────────────────────────

/**
 * Returns the original text by joining token surfaces.
 * This is lossless as long as surfaces were never dropped (they aren't).
 *
 * Note: word order and spacing is approximate — we join with a single space.
 * For exact byte-for-byte reconstruction you would use token.offset instead.
 */
export function detokenize(tokens: CSTToken[]): string {
  return tokens
    .filter((t) => t.surface.length > 0)
    .map((t) => t.surface)
    .join(" ");
}

/**
 * Reconstruct from offset positions (exact, preserves original whitespace).
 * Requires the original input string.
 *
 * ROLE tokens are intentionally skipped: they share the same surface and
 * offset as their preceding ROOT token, so including them would duplicate text.
 */
export function reconstruct(original: string, tokens: CSTToken[]): string {
  if (tokens.length === 0) return "";
  // Skip ROLE tokens — they are logical annotations, not additional surface spans
  const surfaceTokens = tokens.filter((t) => t.type !== "ROLE");
  // Sort by offset start
  const sorted = [...surfaceTokens].sort((a, b) => a.offset[0] - b.offset[0]);
  const parts: string[] = [];
  let cursor = 0;
  for (const tok of sorted) {
    const [start, end] = tok.offset;
    if (start > cursor) {
      parts.push(original.slice(cursor, start)); // whitespace/punct between tokens
    }
    parts.push(tok.surface);
    cursor = end;
  }
  if (cursor < original.length) {
    parts.push(original.slice(cursor));
  }
  return parts.join("");
}

// ── 2. digest — compact semantic string ───────────────────────────────────────

/**
 * Returns a compact semantic digest of the token stream.
 * Useful for logging and diff-ing tokenizer output.
 *
 * Example: "STR:modal ROOT:art.music ROOT:time.alarm ROLE:agent LIT:alexa"
 */
export function digest(tokens: CSTToken[]): string {
  return tokens.map((t) => t.compact).join(" ");
}

// ── 3. gloss — human-readable annotation ──────────────────────────────────────

/**
 * Returns a human-readable annotated string.
 * Format per token: [surface:type:gloss]
 *
 * Example:
 *   Input tokens for "set an alarm for tomorrow morning"
 *   → "[set:ROOT:fix/adjust] [alarm:ROOT:time.alarm] [for:REL:for] [tomorrow:ROOT:time] [morning:ROOT:time]"
 */
export function gloss(tokens: CSTToken[]): string {
  return tokens
    .map((t) => {
      const typeLabel =
        t.type === "ROOT"
          ? `ROOT:${t.field ?? "?"}`
          : t.type === "ROLE"
            ? `ROLE:${t.role ?? "?"}`
            : t.type === "REL"
              ? `REL:${t.relation ?? "?"}`
              : t.type === "STR"
                ? `STR:${t.structure ?? "?"}`
                : "LIT";
      const g = t.gloss ? `:${t.gloss}` : "";
      return `[${t.surface}|${typeLabel}${g}]`;
    })
    .join(" ");
}

// ── 4. toLLMContext — injectable string for LLM prompts ───────────────────────

/**
 * Converts a token stream into a human-readable context string suitable
 * for injection into an LLM prompt before the user's message.
 *
 * Example output:
 *   "Intent: modal | Topics: art.music, time.alarm | Unknown words: alexa"
 */
export function toLLMContext(tokens: CSTToken[]): string {
  const parts: string[] = [];

  // Structural markers (intent signals)
  const strTokens = tokens.filter((t) => t.type === "STR");
  if (strTokens.length > 0) {
    const markers = [
      ...new Set(strTokens.map((t) => t.structure).filter(Boolean)),
    ];
    parts.push(`Intent: ${markers.join(", ")}`);
  }

  // Root fields (topics)
  const rootTokens = tokens.filter((t) => t.type === "ROOT" && t.field);
  if (rootTokens.length > 0) {
    const fields = [...new Set(rootTokens.map((t) => t.field!))];
    parts.push(`Topics: ${fields.join(", ")}`);
  }

  // Root glosses (meaning)
  const glosses = rootTokens
    .filter((t) => t.gloss)
    .map((t) => `${t.surface}=${t.gloss}`);
  if (glosses.length > 0) {
    parts.push(`Meaning: ${glosses.join("; ")}`);
  }

  // LIT fallbacks (unknown words the LLM should still see)
  const litTokens = tokens.filter((t) => t.type === "LIT");
  if (litTokens.length > 0) {
    const lits = litTokens.map((t) => t.surface).join(", ");
    parts.push(`Unknown: ${lits}`);
  }

  return parts.join(" | ");
}
