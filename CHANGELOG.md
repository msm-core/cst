# Changelog — @msm-core/cst

All notable changes are documented here.
Follows [Semantic Versioning](https://semver.org/).

---

## [0.3.1] — 2026-06-09

### Added

- **Arabic root reduction.** When direct/segmentation/augment lookups miss, the
  tokenizer now reduces a derived noun/verb form to its triliteral root (place
  nouns مفعل, masdar فعالة, sound/broken plurals, nisba -ية, Form IV, long-vowel
  infixes) and retries the field lookup. It accepts a reduction **only** if it
  resolves to a known root, so it can never invent a field — precision-safe.
  Drops Arabic LIT ratio from ~35% to ~28% on the eval corpus with no precision
  regression (مقتل→قتل/place, الزراعة→زرع, العلاقات→علق, أعلنت→علن).
- Curated common modern roots (عرف, علم, درس, عود, ثور, حدث, نشأ, خط, …).
- CI-portable coverage regression gate (`tests/coverage.test.ts` + committed
  fixtures) — no longer depends on the gitignored eval corpora.

### Fixed

- **Arabic compound map** was rebuilt on every `tokenizeAr()` call; now cached at
  module level like the other lookups (removes a per-call hot-path cost).
- **English silent-e stem** ("writing"→"writ"): the reported stem now reflects
  the form that actually matched (was always the bare stem).
- README documented a `CONCEPT` token type; the tokenizer emits separate `ROOT`
  and `ROLE` tokens. README + gloss examples corrected to real output, and the
  stale "Arabic added in Phase 5" note removed (Arabic is implemented).

### Packaging

- `publishConfig.access: "public"`, `repository`, and README/CHANGELOG added to
  the published tarball.
